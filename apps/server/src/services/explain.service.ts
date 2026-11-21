import crypto from 'node:crypto';
import {
  ErrorCode,
  ExplainStatus,
  LearningMode,
  EXPLAIN_CORE_STEPS_COUNT,
  MAX_DEEP_DIVE_DEPTH,
  TopicSessionDTO,
  ExplainInitOutputDTO,
  ExplainDeepDiveOutputDTO,
  ExplainInitOutputSchema,
  ExplainDeepDiveOutputSchema,
  QuotaMetaDTO,
} from '@mentora/shared';
import { AppError } from '../utils/AppError.js';
import {
  sessionRepository,
  SessionRepository,
} from '../repositories/session.repository.js';
import {
  userRepository,
  UserRepository,
} from '../repositories/user.repository.js';
import { generateStructuredOutput } from '../ai/gemini.client.js';
import { PromptBuilder } from '../ai/prompts/prompt.builder.js';
import {
  explainInitGeminiSchema,
  explainDeepDiveGeminiSchema,
} from '../ai/schemas/index.js';
import { toTopicSessionDTO } from './session.service.js';
import { LearnerRef, learnerIdOf, resolveLearnerProfile } from './learner-profile.js';
import { IDeepDiveSubCard } from '../models/TopicSession.model.js';
import { QuotaReservation } from '../middlewares/quota.middleware.js';

export interface ExplainResult {
  session: TopicSessionDTO;
  quota?: QuotaMetaDTO;
}

export class ExplainService {
  constructor(
    private readonly sessionRepo: SessionRepository = sessionRepository,
    private readonly userRepo: UserRepository = userRepository
  ) {}

  /**
   * Initializes Explain Mode for a session.
   * If explainState.status === 'ready', returns existing state idempotently without calling
   * Gemini and releases the reserved quota unit.
   * Otherwise, generates 4 progressive cards, saves them only if no concurrent request has
   * already done so, and commits the quota unit for the request whose write landed (A-07).
   */
  async initializeExplain(
    learner: LearnerRef,
    sessionId: string,
    reservation?: QuotaReservation
  ): Promise<ExplainResult> {
    const userId = learnerIdOf(learner);
    const session = await this.sessionRepo.findSession(sessionId, userId);
    if (!session) {
      throw new AppError(
        404,
        ErrorCode.RESOURCE_NOT_FOUND,
        'Topic session not found.'
      );
    }

    // Idempotent initialization: return existing ready state
    if (session.explainState && session.explainState.status === ExplainStatus.READY) {
      return { session: toTopicSessionDTO(session), quota: await reservation?.release() };
    }

    const profile = await resolveLearnerProfile(learner, this.userRepo);

    const systemInstruction = PromptBuilder.buildSystemInstruction(
      profile,
      LearningMode.EXPLAIN
    );
    const prompt = PromptBuilder.buildExplainInitPrompt(session.topicQuery);

    const output = await generateStructuredOutput<ExplainInitOutputDTO>({
      operation: 'EXPLAIN_INIT',
      systemInstruction,
      prompt,
      responseSchema: explainInitGeminiSchema,
      zodSchema: ExplainInitOutputSchema,
      temperature: 0.2,
    });

    const explainState = {
      status: ExplainStatus.READY,
      currentStepIndex: 0,
      cards: output.cards.map((card) => ({
        stepNumber: card.stepNumber,
        stepType: card.stepType,
        title: card.title.trim(),
        contentMarkdown: card.contentMarkdown.trim(),
        checkQuestion: card.checkQuestion ? card.checkQuestion.trim() : null,
        checkAnswer:
          card.checkAnswer && card.checkAnswer.trim().length > 0
            ? card.checkAnswer.trim()
            : null,
        deepDives: [],
      })),
      suggestedSubTopics: output.suggestedSubTopics
        ? [...output.suggestedSubTopics]
        : [],
    };

    const normalizedTitle =
      output.normalizedTitle && output.normalizedTitle.trim().length > 0
        ? output.normalizedTitle.trim()
        : session.normalizedTitle;

    // Filtered save: only the first concurrent initializer writes its cards (A-07).
    const saved = await this.sessionRepo.setIfMatches(
      session._id,
      { 'explainState.status': { $ne: ExplainStatus.READY } },
      { explainState, normalizedTitle }
    );

    if (!saved) {
      const winner = await this.sessionRepo.findById(session._id);
      if (!winner) {
        throw new AppError(404, ErrorCode.RESOURCE_NOT_FOUND, 'Topic session not found.');
      }
      return { session: toTopicSessionDTO(winner), quota: await reservation?.release() };
    }

    return { session: toTopicSessionDTO(saved), quota: reservation?.commit() };
  }

  /**
   * Advances the current step index (0..3) for Explain Mode.
   * Progression is local and MUST NOT increment user quota (AC-EXP-02, BR-04).
   */
  async advanceStep(
    userId: string | undefined,
    sessionId: string,
    stepIndex: number
  ): Promise<TopicSessionDTO> {
    if (
      typeof stepIndex !== 'number' ||
      !Number.isInteger(stepIndex) ||
      stepIndex < 0 ||
      stepIndex > EXPLAIN_CORE_STEPS_COUNT - 1
    ) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `Step index must be an integer between 0 and ${EXPLAIN_CORE_STEPS_COUNT - 1}.`
      );
    }

    const session = await this.sessionRepo.findSession(sessionId, userId);
    if (!session) {
      throw new AppError(
        404,
        ErrorCode.RESOURCE_NOT_FOUND,
        'Topic session not found.'
      );
    }

    session.explainState.currentStepIndex = stepIndex;
    const savedSession = await this.sessionRepo.save(session);

    return toTopicSessionDTO(savedSession);
  }

  /**
   * Generates a "Go Deeper" sub-card for a specified parent stepNumber (1..4).
   * Appends to the parent card's deepDives array up to MAX_DEEP_DIVE_DEPTH (2),
   * preserves currentStepIndex, and commits the reserved quota unit (AC-EXP-03, BR-04).
   */
  async generateDeepDive(
    learner: LearnerRef,
    sessionId: string,
    stepNumber: number,
    reservation?: QuotaReservation
  ): Promise<ExplainResult> {
    const userId = learnerIdOf(learner);
    if (
      typeof stepNumber !== 'number' ||
      !Number.isInteger(stepNumber) ||
      stepNumber < 1 ||
      stepNumber > EXPLAIN_CORE_STEPS_COUNT
    ) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `Step number must be an integer between 1 and ${EXPLAIN_CORE_STEPS_COUNT}.`
      );
    }

    const session = await this.sessionRepo.findSession(sessionId, userId);
    if (!session) {
      throw new AppError(
        404,
        ErrorCode.RESOURCE_NOT_FOUND,
        'Topic session not found.'
      );
    }

    if (
      session.explainState.status !== ExplainStatus.READY ||
      !session.explainState.cards ||
      session.explainState.cards.length === 0
    ) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Explain mode has not been initialized for this session.'
      );
    }

    const targetCard = session.explainState.cards.find(
      (c) => c.stepNumber === stepNumber
    );

    if (!targetCard) {
      throw new AppError(
        404,
        ErrorCode.RESOURCE_NOT_FOUND,
        `Explain card for step ${stepNumber} not found.`
      );
    }

    if (targetCard.deepDives && targetCard.deepDives.length >= MAX_DEEP_DIVE_DEPTH) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `Maximum deep-dive depth of ${MAX_DEEP_DIVE_DEPTH} reached for step ${stepNumber}.`
      );
    }

    const profile = await resolveLearnerProfile(learner, this.userRepo);

    const systemInstruction = PromptBuilder.buildSystemInstruction(
      profile,
      LearningMode.EXPLAIN
    );
    const prompt = PromptBuilder.buildExplainDeeperPrompt({
      topicQuery: session.topicQuery,
      parentCard: {
        stepType: targetCard.stepType,
        title: targetCard.title,
        contentMarkdown: targetCard.contentMarkdown,
        depthLevel: targetCard.deepDives.length,
      },
    });

    const output = await generateStructuredOutput<ExplainDeepDiveOutputDTO>({
      operation: 'EXPLAIN_DEEPER',
      systemInstruction,
      prompt,
      responseSchema: explainDeepDiveGeminiSchema,
      zodSchema: ExplainDeepDiveOutputSchema,
    });

    const newSubCard: IDeepDiveSubCard = {
      id: crypto.randomUUID(),
      depthLevel: targetCard.deepDives.length + 1,
      title: output.title.trim(),
      contentMarkdown: output.contentMarkdown.trim(),
      createdAt: new Date().toISOString(),
    };

    targetCard.deepDives.push(newSubCard);

    const savedSession = await this.sessionRepo.save(session);

    return { session: toTopicSessionDTO(savedSession), quota: reservation?.commit() };
  }
}

export const explainService = new ExplainService();

