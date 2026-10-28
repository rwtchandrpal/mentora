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
import {
  IInteractMilestone,
  IInteractMessage,
  ITopicSessionDocument,
} from '../models/TopicSession.model.js';
import { IUserDocument } from '../models/User.model.js';
import { toQuotaMetaDTO } from '../middlewares/quota.middleware.js';
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
 * 3. outcome === CIRCUIT_BREAKER_ACK or strikeCount >= 2 (Strike 3 reached): Circuit Breaker triggered, resets strikeCount = 0.
 * 4. outcome === STRIKE:
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

  // Case C: Circuit Breaker Ack from model or Strike 3 reached
  if (outcome === SocraticOutcome.CIRCUIT_BREAKER_ACK || strikeCount >= 2) {
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
 * Stream parser that buffers initial chunks, extracts and strips the first-line control header:
 * <<MENTORA_STATE:{"outcome":"ADVANCE"|"STRIKE"|"CIRCUIT_BREAKER_ACK"}>>
 * and forwards pure markdown deltas.
 */
export class ControlHeaderStreamParser {
  private buffer = '';
  private headerFound = false;
  private outcome: SocraticOutcome;

  constructor(defaultOutcome: SocraticOutcome) {
    this.outcome = defaultOutcome;
  }

  processChunk(chunk: string): string {
    if (this.headerFound) {
      return chunk;
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
      return remainder;
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
      return textToFlush;
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
      return cleanText;
    }
    return '';
  }

  getOutcome(): SocraticOutcome {
    return this.outcome;
  }
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
    userId: string,
    sessionId: string
  ): Promise<{ session: ITopicSessionDocument; user: IUserDocument }> {
    const session = await this.sessionRepo.findByIdAndUserId(sessionId, userId);
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

    return { session, user };
  }

  /**
   * Initializes Interact Mode for a session.
   * Idempotent: If already initialized, returns existing state without calling Gemini or incrementing quota.
   */
  async initializeInteract(
    userId: string,
    sessionId: string
  ): Promise<{ session: TopicSessionDTO; quota?: QuotaMetaDTO }> {
    const session = await this.sessionRepo.findByIdAndUserId(sessionId, userId);
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
      const user = await this.userRepo.findById(userId);
      const quotaMeta = user ? toQuotaMetaDTO(user.usageQuota) : undefined;
      return {
        session: toTopicSessionDTO(session),
        quota: quotaMeta,
      };
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

    if (output.normalizedTitle && output.normalizedTitle.trim().length > 0) {
      session.normalizedTitle = output.normalizedTitle.trim();
    }

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

    session.interactState = {
      status: InteractStatus.ACTIVE,
      activeMilestoneIndex: 0,
      strikeCount: 0,
      milestones,
      messages: [openingMessage],
    };
    session.lastActiveMode = LearningMode.INTERACT;

    const savedSession = await this.sessionRepo.save(session);
    const updatedUser = await this.userRepo.incrementUserQuota(userId);
    const quotaMeta = updatedUser ? toQuotaMetaDTO(updatedUser.usageQuota) : undefined;

    return {
      session: toTopicSessionDTO(savedSession),
      quota: quotaMeta,
    };
  }

  /**
   * Processes a streaming Socratic interaction turn over SSE.
   * On successful stream completion, updates state, appends messages, increments quota, and emits metadata.
   * On failure mid-flight, leaves MongoDB state unchanged and emits event: error (Edge Case 4).
   */
  async processTurnStream(
    userId: string,
    sessionId: string,
    payload: InteractStreamRequestDTO,
    sseWriter: SseWriter
  ): Promise<void> {
    const { session, user } = await this.validateTurnPreconditions(
      userId,
      sessionId
    );

    const turnId = crypto.randomUUID();
    const activeMilestoneIndex = session.interactState.activeMilestoneIndex;

    // 1. Emit start event
    sseWriter.sendStart({
      turnId,
      activeMilestoneIndex,
    });

    const profile: StaticLearnerProfile = {
      educationLevel: user.profile.educationLevel!,
      preferredStyle: user.profile.preferredStyle!,
    };

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
      history: session.interactState.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      userMessage: payload.message,
    });

    const defaultOutcome = payload.forceDirectExplanation
      ? SocraticOutcome.CIRCUIT_BREAKER_ACK
      : SocraticOutcome.STRIKE;
    const parser = new ControlHeaderStreamParser(defaultOutcome);

    let accumulatedAssistantText = '';

    try {
      for await (const chunk of streamContent({
        operation: 'INTERACT_STREAM',
        systemInstruction,
        prompt,
      })) {
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
      const message =
        streamErr instanceof Error
          ? streamErr.message
          : 'Failed to stream response from AI tutor.';
      sseWriter.sendError({ code, message });
      return;
    }

    const finalOutcome = parser.getOutcome();

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

    // 4. Save and increment quota atomically on turn success
    await this.sessionRepo.save(session);
    const updatedUser = await this.userRepo.incrementUserQuota(userId);
    const quotaMeta = updatedUser
      ? toQuotaMetaDTO(updatedUser.usageQuota)
      : undefined;

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

