import {
  ErrorCode,
  ExplainStatus,
  LearningMode,
  EXPLAIN_CORE_STEPS_COUNT,
  TopicSessionDTO,
  ExplainInitOutputDTO,
  ExplainInitOutputSchema,
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
import { stripInvalidMermaid } from '../utils/mermaid.sanitizer.js';
import { PromptBuilder } from '../ai/prompts/prompt.builder.js';
import { explainInitGeminiSchema } from '../ai/schemas/index.js';
import { toTopicSessionDTO } from './session.service.js';
import { LearnerRef, learnerIdOf, resolveLearnerProfile } from './learner-profile.js';
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
        contentMarkdown: stripInvalidMermaid(card.contentMarkdown.trim()),
        checkQuestion: card.checkQuestion ? card.checkQuestion.trim() : null,
        checkAnswer:
          card.checkAnswer && card.checkAnswer.trim().length > 0
            ? card.checkAnswer.trim()
            : null,
      })),
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

    // There are no cards to step through until init has run (L-05).
    if (session.explainState.status !== ExplainStatus.READY) {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        'Explain mode has not been initialized for this session yet.'
      );
    }

    session.explainState.currentStepIndex = stepIndex;
    const savedSession = await this.sessionRepo.save(session);

    return toTopicSessionDTO(savedSession);
  }

}

export const explainService = new ExplainService();

