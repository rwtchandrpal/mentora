import crypto from 'node:crypto';
import {
  ErrorCode,
  InteractStatus,
  MilestoneStatus,
  ChatRole,
  SocraticOutcome,
  LearningMode,
  TopicSessionDTO,
  InteractStreamRequestDTO,
  InteractInitOutputDTO,
  InteractInitOutputSchema,
  MentoraStreamControlHeaderSchema,
  StaticLearnerProfile,
  QuotaMetaDTO,
  MAX_INTERACT_PROMPT_HISTORY,
} from '@mentora/shared';
import { AppError } from '../utils/AppError.js';
import { logger } from '../config/logger.js';
import {
  sessionRepository,
  SessionRepository,
} from '../repositories/session.repository.js';
import {
  userRepository,
  UserRepository,
} from '../repositories/user.repository.js';
import {
  generateStructuredOutput,
  streamContent,
} from '../ai/gemini.client.js';
import { PromptBuilder } from '../ai/prompts/prompt.builder.js';
import { interactInitGeminiSchema } from '../ai/schemas/index.js';
import { toTopicSessionDTO } from './session.service.js';
import { LearnerRef, learnerIdOf, resolveLearnerProfile } from './learner-profile.js';
import {
  IInteractMilestone,
  IInteractMessage,
  ITopicSessionDocument,
} from '../models/TopicSession.model.js';
import {
  QuotaReservation,
  releasePendingReservation,
} from '../middlewares/quota.middleware.js';
import { SseWriter } from '../utils/sse.helper.js';

export interface ComputeNextInteractStateParams {
  milestones: IInteractMilestone[];
  activeMilestoneIndex: number;
  strikeCount: number;
  outcome: SocraticOutcome;
  forceDirectExplanation: boolean;
}

export interface NextInteractStateResult {
  updatedMilestones: IInteractMilestone[];
  nextMilestoneIndex: number;
  nextStrikeCount: number;
  nextStatus: InteractStatus;
  isCircuitBreakerExplanation: boolean;
  strikeNumberAtTurn: number;
}

/**
 * Pure state transition function implementing the deterministic 3-Strike Socratic Circuit Breaker.
 *
 * Rules:
 * 1. forceDirectExplanation === true: Circuit Breaker triggered directly, resets strikeCount = 0 (FR-013, AC-INT-02).
 * 2. outcome === ADVANCE: Active milestone marked COMPLETED; if more milestones exist, next is marked ACTIVE and index increments;
 *    if all completed, interact status becomes COMPLETED. strikeCount resets to 0.
 * 3. outcome === OFF_TOPIC (L-06): learner message was off-topic, nonsensical, or a refusal-worthy
 *    request. Milestone, status, and strikeCount are left unchanged — this is neither progress
 *    nor a strike.
 * 4. strikeCount >= 2 (Strike 3 reached): Circuit Breaker triggered, resets strikeCount = 0.
 * 5. outcome === STRIKE, or CIRCUIT_BREAKER_ACK before Strike 3 (the model may not shorten
 *    the ladder; LIVE-BUG-M1):
 *    - strikeCount 0 -> 1 (Strike 1 Nudge).
 *    - strikeCount 1 -> 2 (Strike 2 Hint).
 */
export const computeNextInteractState = (
  params: ComputeNextInteractStateParams
): NextInteractStateResult => {
  const {
    milestones,
    activeMilestoneIndex,
    strikeCount,
    outcome,
    forceDirectExplanation,
  } = params;

  // Immutably clone milestones
  const updatedMilestones: IInteractMilestone[] = milestones.map((m) => ({
    milestoneNumber: m.milestoneNumber,
    title: m.title,
    description: m.description,
    status: m.status,
  }));

  // Case A: Manual Direct Explanation Escape Hatch (FR-013, AC-INT-02)
  if (forceDirectExplanation) {
    return {
      updatedMilestones,
      nextMilestoneIndex: activeMilestoneIndex,
      nextStrikeCount: 0,
      nextStatus: InteractStatus.ACTIVE,
      isCircuitBreakerExplanation: true,
      strikeNumberAtTurn: strikeCount,
    };
  }

  // Case B: Learner demonstrated conceptual mastery
  if (outcome === SocraticOutcome.ADVANCE) {
    if (updatedMilestones[activeMilestoneIndex]) {
      updatedMilestones[activeMilestoneIndex].status = MilestoneStatus.COMPLETED;
    }

    const hasNextMilestone = activeMilestoneIndex + 1 < updatedMilestones.length;
    if (hasNextMilestone) {
      const nextIndex = activeMilestoneIndex + 1;
      if (updatedMilestones[nextIndex]) {
        updatedMilestones[nextIndex].status = MilestoneStatus.ACTIVE;
      }
      return {
        updatedMilestones,
        nextMilestoneIndex: nextIndex,
        nextStrikeCount: 0,
        nextStatus: InteractStatus.ACTIVE,
        isCircuitBreakerExplanation: false,
        strikeNumberAtTurn: 0,
      };
    } else {
      // Completed all milestones!
      return {
        updatedMilestones,
        nextMilestoneIndex: activeMilestoneIndex,
        nextStrikeCount: 0,
        nextStatus: InteractStatus.COMPLETED,
        isCircuitBreakerExplanation: false,
        strikeNumberAtTurn: 0,
      };
    }
  }

  // Case B.5: Off-topic, nonsensical, or refusal-worthy learner message (L-06). Leave the
  // milestone, strike count, and status untouched — this turn is neither a strike nor progress.
  if (outcome === SocraticOutcome.OFF_TOPIC) {
    return {
      updatedMilestones,
      nextMilestoneIndex: activeMilestoneIndex,
      nextStrikeCount: strikeCount,
      nextStatus: InteractStatus.ACTIVE,
      isCircuitBreakerExplanation: false,
      strikeNumberAtTurn: strikeCount,
    };
  }

  // Case C: Strike 3 reached. The server's strike count decides, not the model: a model
  // that answers CIRCUIT_BREAKER_ACK at strike 0 or 1 has skipped the nudge or the hint,
  // so that turn counts as an ordinary strike (LIVE-BUG-M1). Only the manual escape
  // hatch (Case A) may break the circuit early.
  if (strikeCount >= 2) {
    return {
      updatedMilestones,
      nextMilestoneIndex: activeMilestoneIndex,
      nextStrikeCount: 0, // Reset to 0 per AC-INT-02
      nextStatus: InteractStatus.ACTIVE,
      isCircuitBreakerExplanation: true,
      strikeNumberAtTurn: 3,
    };
  }

  // Case D: Socratic Strike Progression
  if (strikeCount === 0) {
    // Strike 1 (Nudge)
    return {
      updatedMilestones,
      nextMilestoneIndex: activeMilestoneIndex,
      nextStrikeCount: 1,
      nextStatus: InteractStatus.ACTIVE,
      isCircuitBreakerExplanation: false,
      strikeNumberAtTurn: 1,
    };
  } else {
    // Strike 2 (Hint)
    return {
      updatedMilestones,
      nextMilestoneIndex: activeMilestoneIndex,
      nextStrikeCount: 2,
      nextStatus: InteractStatus.ACTIVE,
      isCircuitBreakerExplanation: false,
      strikeNumberAtTurn: 2,
    };
  }
};

/**
 * Internal state-machine jargon ("strike", "circuit breaker") must never reach the learner —
 * it's an implementation detail, not pedagogy (L-06). The prompt instructs the model to avoid
 * these words; this is the backstop in case it slips up anyway.
 */
const CIRCUIT_BREAKER_TERM = 'circuit breakers?';
const STRIKE_TERM = 'strikes?';

/**
 * Builds the scrubber for one session. A term that appears in the subject itself (topic,
 * milestone titles/descriptions) is real subject vocabulary, e.g. "lightning strikes" or
 * "circuit breakers trip on overcurrent", so it is left alone; otherwise it can only be
 * leaked tutor jargon and is rewritten (M-05).
 */
export const createTerminologyScrubber = (subjectText = ''): ((text: string) => string) => {
  const terms = [CIRCUIT_BREAKER_TERM, STRIKE_TERM].filter(
    (term) => !new RegExp(`\\b${term}\\b`, 'i').test(subjectText)
  );
  if (terms.length === 0) {
    return (text) => text;
  }
  const pattern = new RegExp(`\\b(${terms.join('|')})\\b`, 'gi');
  return (text) =>
    text.replace(pattern, (match) => {
      const plural = match.toLowerCase().endsWith('s');
      if (match.toLowerCase().startsWith('circuit')) {
        return plural ? 'direct explanations' : 'direct explanation';
      }
      return plural ? 'attempts' : 'attempt';
    });
};

/**
 * Stream parser that buffers initial chunks, extracts and strips the first-line control header:
 * <<MENTORA_STATE:{"outcome":"ADVANCE"|"STRIKE"|"CIRCUIT_BREAKER_ACK"|"OFF_TOPIC"}>>
 * and forwards pure markdown deltas, scrubbed of internal state-machine terminology (L-06).
 */
export class ControlHeaderStreamParser {
  private buffer = '';
  private headerFound = false;
  private outcome: SocraticOutcome;
  private readonly scrub: (text: string) => string;

  /**
   * @param subjectText The session's topic and milestone text; terms that appear in it are
   *   subject vocabulary and are not scrubbed (M-05).
   */
  constructor(defaultOutcome: SocraticOutcome, subjectText = '') {
    this.outcome = defaultOutcome;
    this.scrub = createTerminologyScrubber(subjectText);
  }

  processChunk(chunk: string): string {
    if (this.headerFound) {
      return this.scrub(chunk);
    }

    this.buffer += chunk;

    const closeIdx = this.buffer.indexOf('>>');
    if (closeIdx !== -1) {
      const headerPart = this.buffer.slice(0, closeIdx + 2);
      let remainder = this.buffer.slice(closeIdx + 2);

      // Strip leading newline after header
      if (remainder.startsWith('\r\n')) {
        remainder = remainder.slice(2);
      } else if (remainder.startsWith('\n')) {
        remainder = remainder.slice(1);
      }

      // Parse JSON inside header
      const match = headerPart.match(/<<MENTORA_STATE:\s*({.*?})\s*>>/);
      if (match && match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          const validation = MentoraStreamControlHeaderSchema.safeParse(parsed);
          if (validation.success) {
            this.outcome = validation.data.outcome;
          }
        } catch {
          // Keep default outcome on json parse error
        }
      }

      this.headerFound = true;
      this.buffer = '';
      return this.scrub(remainder);
    }

    // Safety fallback: if buffer exceeds 200 chars or has newline without '<<',
    // the model skipped the header. Flush buffer to prevent swallowing learner text.
    if (
      this.buffer.length > 200 ||
      (this.buffer.includes('\n') && !this.buffer.includes('<<'))
    ) {
      this.headerFound = true;
      const textToFlush = this.buffer;
      this.buffer = '';
      return this.scrub(textToFlush);
    }

    // Still buffering looking for '>>'
    return '';
  }

  flush(): string {
    if (!this.headerFound && this.buffer.length > 0) {
      this.headerFound = true;
      const cleanText = this.buffer
        .replace(/<<MENTORA_STATE:.*?>>/g, '')
        .trimStart();
      this.buffer = '';
      return this.scrub(cleanText);
    }
    return '';
  }

  getOutcome(): SocraticOutcome {
    return this.outcome;
  }
}

export interface TurnPreconditions {
  session: ITopicSessionDocument;
  profile: StaticLearnerProfile;
}

export class InteractService {
  constructor(
    private readonly sessionRepo: SessionRepository = sessionRepository,
    private readonly userRepo: UserRepository = userRepository
  ) {}

  /**
   * Validates prerequisites for processing a Socratic turn stream.
   * Throws standard operational AppErrors before SSE headers are flushed.
   */
  async validateTurnPreconditions(
    learner: LearnerRef,
    sessionId: string
  ): Promise<TurnPreconditions> {
    const userId = learnerIdOf(learner);
    const session = await this.sessionRepo.findSession(sessionId, userId);
    if (!session) {
      throw new AppError(
        404,
        ErrorCode.RESOURCE_NOT_FOUND,
        'Topic session not found.'
      );
    }

    if (
      !session.interactState ||
      session.interactState.status === InteractStatus.NOT_STARTED ||
      session.interactState.milestones.length === 0
    ) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Interact mode has not been initialized for this session. Please initialize interact mode first.'
      );
    }

    // Every milestone is mastered: further turns would be charged and could regress the
    // session back to `active`, so reject them before any quota is kept or SSE is opened.
    if (session.interactState.status === InteractStatus.COMPLETED) {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        'This Interact session is already complete. Switch to Practice Mode to test yourself.'
      );
    }

    const profile = await resolveLearnerProfile(learner, this.userRepo);
    return { session, profile };
  }

  /**
   * Initializes Interact Mode for a session.
   * Idempotent: If already initialized, returns existing state without calling Gemini and
   * releases the reserved quota unit. Concurrent initializers: only the first write lands and
   * only that request keeps its quota unit (A-07).
   */
  async initializeInteract(
    learner: LearnerRef,
    sessionId: string,
    reservation?: QuotaReservation
  ): Promise<{ session: TopicSessionDTO; quota?: QuotaMetaDTO }> {
    const userId = learnerIdOf(learner);
    const session = await this.sessionRepo.findSession(sessionId, userId);
    if (!session) {
      throw new AppError(
        404,
        ErrorCode.RESOURCE_NOT_FOUND,
        'Topic session not found.'
      );
    }

    // Idempotent initialization check
    if (
      session.interactState &&
      session.interactState.status !== InteractStatus.NOT_STARTED &&
      session.interactState.milestones.length >= 3
    ) {
      return {
        session: toTopicSessionDTO(session),
        quota: await reservation?.release(),
      };
    }

    const profile = await resolveLearnerProfile(learner, this.userRepo);

    const systemInstruction = PromptBuilder.buildSystemInstruction(
      profile,
      LearningMode.INTERACT
    );
    const prompt = PromptBuilder.buildInteractInitPrompt(session.topicQuery);

    const output = await generateStructuredOutput<InteractInitOutputDTO>({
      operation: 'INTERACT_INIT',
      systemInstruction,
      prompt,
      responseSchema: interactInitGeminiSchema,
      zodSchema: InteractInitOutputSchema,
    });

    const milestones: IInteractMilestone[] = output.milestones.map((m, idx) => ({
      milestoneNumber: m.milestoneNumber,
      title: m.title.trim(),
      description: m.description.trim(),
      status: idx === 0 ? MilestoneStatus.ACTIVE : MilestoneStatus.PENDING,
    }));

    const openingMessage: IInteractMessage = {
      id: crypto.randomUUID(),
      role: ChatRole.ASSISTANT,
      content: (output.openingQuestion || '').trim(),
      milestoneNumber: 1,
      strikeNumberAtTurn: 0,
      isCircuitBreakerExplanation: false,
      createdAt: new Date().toISOString(),
    };

    const set: Record<string, unknown> = {
      interactState: {
        status: InteractStatus.ACTIVE,
        activeMilestoneIndex: 0,
        strikeCount: 0,
        milestones,
        messages: [openingMessage],
      },
      lastActiveMode: LearningMode.INTERACT,
    };
    if (output.normalizedTitle && output.normalizedTitle.trim().length > 0) {
      set.normalizedTitle = output.normalizedTitle.trim();
    }

    // Filtered save: the guard is the negation of the idempotency check above.
    const saved = await this.sessionRepo.setIfMatches(
      session._id,
      {
        $or: [
          { 'interactState.status': InteractStatus.NOT_STARTED },
          { 'interactState.milestones.2': { $exists: false } },
        ],
      },
      set
    );

    if (!saved) {
      const winner = await this.sessionRepo.findById(session._id);
      if (!winner) {
        throw new AppError(404, ErrorCode.RESOURCE_NOT_FOUND, 'Topic session not found.');
      }
      return { session: toTopicSessionDTO(winner), quota: await reservation?.release() };
    }

    return {
      session: toTopicSessionDTO(saved),
      quota: reservation?.commit(),
    };
  }

  /**
   * Processes a streaming Socratic interaction turn over SSE.
   * On successful stream completion, updates state, appends messages, commits the reserved
   * quota unit, and emits metadata.
   * On failure mid-flight, leaves MongoDB state unchanged, releases the reserved quota unit
   * and emits event: error (Edge Case 4).
   */
  async processTurnStream(
    learner: LearnerRef,
    sessionId: string,
    payload: InteractStreamRequestDTO,
    sseWriter: SseWriter,
    reservation?: QuotaReservation,
    /**
     * Result of validateTurnPreconditions when the caller already ran it before opening
     * the stream, so the session and profile are not loaded twice per turn (L-09).
     */
    preconditions?: TurnPreconditions
  ): Promise<void> {
    const userId = learnerIdOf(learner);
    const { session, profile } =
      preconditions ?? (await this.validateTurnPreconditions(learner, sessionId));

    const turnId = crypto.randomUUID();
    const activeMilestoneIndex = session.interactState.activeMilestoneIndex;

    // 1. Emit start event
    sseWriter.sendStart({
      turnId,
      activeMilestoneIndex,
    });

    const systemInstruction = PromptBuilder.buildSystemInstruction(
      profile,
      LearningMode.INTERACT
    );

    const prompt = PromptBuilder.buildInteractTurnPrompt({
      topicQuery: session.topicQuery,
      milestones: session.interactState.milestones.map((m) => ({
        milestoneNumber: m.milestoneNumber,
        title: m.title,
        description: m.description,
        status: m.status,
      })),
      activeMilestoneIndex,
      strikeCount: session.interactState.strikeCount,
      forceDirectExplanation: payload.forceDirectExplanation ?? false,
      // Only the most recent turns; the milestone roadmap carries longer-range context (A-11).
      history: session.interactState.messages.slice(-MAX_INTERACT_PROMPT_HISTORY).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      userMessage: payload.message,
    });

    const defaultOutcome = payload.forceDirectExplanation
      ? SocraticOutcome.CIRCUIT_BREAKER_ACK
      : SocraticOutcome.STRIKE;
    // Topic and roadmap text decide which internal terms are real subject vocabulary (M-05).
    const subjectText = [
      session.topicQuery,
      session.normalizedTitle,
      ...session.interactState.milestones.flatMap((m) => [m.title, m.description]),
    ].join('\n');
    const parser = new ControlHeaderStreamParser(defaultOutcome, subjectText);

    let accumulatedAssistantText = '';

    try {
      for await (const chunk of streamContent({
        operation: 'INTERACT_STREAM',
        systemInstruction,
        prompt,
        abortSignal: sseWriter.signal,
      })) {
        if (sseWriter.isAborted) {
          break;
        }
        const textToSend = parser.processChunk(chunk);
        if (textToSend.length > 0) {
          accumulatedAssistantText += textToSend;
          sseWriter.sendToken({ delta: textToSend });
        }
      }

      const remainingText = parser.flush();
      if (remainingText.length > 0) {
        accumulatedAssistantText += remainingText;
        sseWriter.sendToken({ delta: remainingText });
      }
    } catch (streamErr) {
      // Mid-stream failure recovery (Edge Case 4): Do NOT increment strikeCount or corrupt MongoDB state
      logger.error(
        { err: streamErr, sessionId, userId },
        'Error during Gemini content streaming for Interact turn'
      );
      const code =
        streamErr instanceof AppError
          ? streamErr.errorCode
          : ErrorCode.AI_UPSTREAM_FAILURE;
      // A-17: only AppError messages are written for clients; raw SDK/runtime
      // error text stays in the log entry above.
      const message =
        streamErr instanceof AppError
          ? streamErr.message
          : 'Failed to stream response from AI tutor.';
      await releasePendingReservation(reservation);
      sseWriter.sendError({ code, message });
      return;
    }

    // Client disconnected mid-stream: the turn was never delivered, so do not
    // persist it or charge quota (A-14).
    if (sseWriter.isAborted) {
      logger.info(
        { sessionId, userId, turnId },
        'Client disconnected during Interact stream; turn discarded'
      );
      await releasePendingReservation(reservation);
      return;
    }

    // Guard: an empty tutor reply must not be persisted or charged (A-04).
    if (accumulatedAssistantText.trim().length === 0) {
      logger.warn(
        { sessionId, userId, turnId },
        'Gemini returned an empty Interact reply; skipping persistence and quota'
      );
      await releasePendingReservation(reservation);
      sseWriter.sendError({
        code: ErrorCode.AI_UPSTREAM_FAILURE,
        message: 'The tutor returned an empty response, please retry.',
      });
      return;
    }

    // Everything below runs after SSE headers were flushed, so failures must be
    // reported as an SSE `error` frame rather than thrown to the error middleware.
    try {
      await this.persistTurnAndEmitMetadata({
        session,
        payload,
        turnId,
        activeMilestoneIndex,
        outcome: parser.getOutcome(),
        assistantText: accumulatedAssistantText,
        sseWriter,
        reservation,
      });
    } catch (persistErr) {
      logger.error(
        { err: persistErr, sessionId, userId, turnId },
        'Failed to persist Interact turn after streaming'
      );
      await releasePendingReservation(reservation);
      sseWriter.sendError({
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Your answer could not be saved. Please retry.',
      });
    }
  }

  private async persistTurnAndEmitMetadata(params: {
    session: ITopicSessionDocument;
    payload: InteractStreamRequestDTO;
    turnId: string;
    activeMilestoneIndex: number;
    outcome: SocraticOutcome;
    assistantText: string;
    sseWriter: SseWriter;
    reservation: QuotaReservation | undefined;
  }): Promise<void> {
    const {
      session,
      payload,
      turnId,
      activeMilestoneIndex,
      sseWriter,
      reservation,
    } = params;
    const finalOutcome = params.outcome;
    const accumulatedAssistantText = params.assistantText;

    // 2. Pure state transition calculation
    const transition = computeNextInteractState({
      milestones: session.interactState.milestones,
      activeMilestoneIndex,
      strikeCount: session.interactState.strikeCount,
      outcome: finalOutcome,
      forceDirectExplanation: payload.forceDirectExplanation ?? false,
    });

    // 3. Message records
    const userMessage: IInteractMessage = {
      id: crypto.randomUUID(),
      role: ChatRole.USER,
      content: payload.message.trim(),
      milestoneNumber: activeMilestoneIndex + 1,
      strikeNumberAtTurn: session.interactState.strikeCount,
      isCircuitBreakerExplanation: false,
      createdAt: new Date().toISOString(),
    };

    const assistantMessage: IInteractMessage = {
      id: turnId,
      role: ChatRole.ASSISTANT,
      content: accumulatedAssistantText.trim(),
      milestoneNumber: activeMilestoneIndex + 1,
      strikeNumberAtTurn: transition.strikeNumberAtTurn,
      isCircuitBreakerExplanation: transition.isCircuitBreakerExplanation,
      createdAt: new Date().toISOString(),
    };

    session.interactState.messages.push(userMessage, assistantMessage);
    session.interactState.activeMilestoneIndex = transition.nextMilestoneIndex;
    session.interactState.strikeCount = transition.nextStrikeCount;
    session.interactState.milestones = transition.updatedMilestones;
    session.interactState.status = transition.nextStatus;
    session.lastActiveMode = LearningMode.INTERACT;

    // 4. Save, then keep the reserved quota unit: the turn was delivered and persisted
    await this.sessionRepo.save(session);
    const quotaMeta = reservation?.commit();

    // 5. Emit metadata and done frames
    sseWriter.sendMetadata({
      activeMilestoneIndex: transition.nextMilestoneIndex,
      strikeCount: transition.nextStrikeCount,
      milestones: transition.updatedMilestones.map((m) => ({
        milestoneNumber: m.milestoneNumber,
        title: m.title,
        description: m.description,
        status: m.status,
      })),
      isCompleted: transition.nextStatus === InteractStatus.COMPLETED,
      userMessage,
      assistantMessage,
      ...(quotaMeta ? { quota: quotaMeta } : {}),
    });

    sseWriter.sendDone();
  }
}

export const interactService = new InteractService();

