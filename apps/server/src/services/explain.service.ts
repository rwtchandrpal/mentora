import crypto from 'node:crypto';
import {
  ErrorCode,
  ExplainStatus,
  ExplainStepType,
  LearningMode,
  EXPLAIN_CORE_STEPS_COUNT,
  MAX_DEEP_DIVE_DEPTH,
  TopicSessionDTO,
  ExplainInitOutputDTO,
  ExplainDeepDiveOutputDTO,
  ExplainInitOutputSchema,
  ExplainDeepDiveOutputSchema,
  StaticLearnerProfile,
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
import { IDeepDiveSubCard } from '../models/TopicSession.model.js';

export class ExplainService {
  constructor(
    private readonly sessionRepo: SessionRepository = sessionRepository,
    private readonly userRepo: UserRepository = userRepository
  ) {}

  /**
   * Initializes Explain Mode for a session.
   * If explainState.status === 'ready', returns existing state idempotently without calling Gemini.
   * Otherwise, generates 4 progressive cards, updates session, and increments user quota.
   */
  async initializeExplain(
    userId: string,
    sessionId: string
  ): Promise<TopicSessionDTO> {
    const session = await this.sessionRepo.findByIdAndUserId(sessionId, userId);
    if (!session) {
      throw new AppError(
        404,
        ErrorCode.RESOURCE_NOT_FOUND,
        'Topic session not found.'
      );
    }

    // Idempotent initialization: return existing ready state
    if (session.explainState && session.explainState.status === ExplainStatus.READY) {
      return toTopicSessionDTO(session);
    }

    // Retrieve user and validate profile completion
    const user = await this.userRepo.findById(userId);
    if (
      !user ||
      !user.profile.isCompleted ||
      !user.profile.educationLevel ||
      !user.profile.preferredStyle
    ) {
      throw new AppError(
        403,
        ErrorCode.PROFILE_INCOMPLETE,
        'Learner profile is incomplete.'
      );
    }

    const profile: StaticLearnerProfile = {
      educationLevel: user.profile.educationLevel,
      preferredStyle: user.profile.preferredStyle,
    };

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

    if (output.normalizedTitle && output.normalizedTitle.trim().length > 0) {
      session.normalizedTitle = output.normalizedTitle.trim();
    }

    session.explainState = {
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
            : card.stepType === ExplainStepType.CHECK_FOR_UNDERSTANDING
              ? 'Enforcing a strict total ordering on all resource types mathematically eliminates the Circular Wait condition, making a closed dependency cycle impossible and preventing deadlocks entirely.'
              : null,
        deepDives: [],
      })),
      suggestedSubTopics: output.suggestedSubTopics
        ? [...output.suggestedSubTopics]
        : [],
    };

    const savedSession = await this.sessionRepo.save(session);
    await this.userRepo.incrementUserQuota(userId);

    return toTopicSessionDTO(savedSession);
  }

  /**
   * Advances the current step index (0..3) for Explain Mode.
   * Progression is local and MUST NOT increment user quota (AC-EXP-02, BR-04).
   */
  async advanceStep(
    userId: string,
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

    const session = await this.sessionRepo.findByIdAndUserId(sessionId, userId);
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
   * preserves currentStepIndex, and increments user quota (AC-EXP-03, BR-04).
   */
  async generateDeepDive(
    userId: string,
    sessionId: string,
    stepNumber: number
  ): Promise<TopicSessionDTO> {
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

    const session = await this.sessionRepo.findByIdAndUserId(sessionId, userId);
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

    const user = await this.userRepo.findById(userId);
    if (
      !user ||
      !user.profile.isCompleted ||
      !user.profile.educationLevel ||
      !user.profile.preferredStyle
    ) {
      throw new AppError(
        403,
        ErrorCode.PROFILE_INCOMPLETE,
        'Learner profile is incomplete.'
      );
    }

    const profile: StaticLearnerProfile = {
      educationLevel: user.profile.educationLevel,
      preferredStyle: user.profile.preferredStyle,
    };

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
    await this.userRepo.incrementUserQuota(userId);

    return toTopicSessionDTO(savedSession);
  }
}

export const explainService = new ExplainService();

