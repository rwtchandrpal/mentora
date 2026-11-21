import {
  ErrorCode,
  PracticeTier,
  BatchStatus,
  LearningMode,
  MCQ_BATCH_SIZE,
  TopicSessionDTO,
  PracticeBatchGenerationDTO,
  PracticeBatchGenerationSchema,
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
import { practiceBatchGeminiSchema } from '../ai/schemas/index.js';
import { toTopicSessionDTO } from './session.service.js';
import { LearnerRef, learnerIdOf, resolveLearnerProfile } from './learner-profile.js';
import { AiOperation } from '../ai/model.router.js';
import { QuotaReservation } from '../middlewares/quota.middleware.js';

export interface PracticeResult {
  session: TopicSessionDTO;
  quota?: QuotaMetaDTO;
}

export class PracticeService {
  constructor(
    private readonly sessionRepo: SessionRepository = sessionRepository,
    private readonly userRepo: UserRepository = userRepository
  ) {}

  /**
   * Generates a 10-MCQ batch for the specified difficulty tier.
   * - Sequential tier lock check: throws 409 TIER_LOCKED if prerequisite tier is not completed (BR-02).
   * - Idempotency / No re-billing: returns existing batch if already in_progress or completed (BR-04).
   * - Reasoning-First structured generation: calls GEMINI_REASONING_MODEL with derivation-first schema (FR-017).
   * - Saves questions with status = 'in_progress' only if no concurrent request already did (A-07),
   *   commits the reserved quota unit for the winning write, and returns masked DTO (BR-03).
   */
  async generateBatch(
    learner: LearnerRef,
    sessionId: string,
    tier: PracticeTier,
    reservation?: QuotaReservation
  ): Promise<PracticeResult> {
    const userId = learnerIdOf(learner);
    const session = await this.sessionRepo.findSession(sessionId, userId);
    if (!session) {
      throw new AppError(
        404,
        ErrorCode.RESOURCE_NOT_FOUND,
        'Topic session not found.'
      );
    }

    const batch = session.practiceState?.batches?.[tier];
    if (!batch) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `Invalid practice tier: ${String(tier)}.`
      );
    }

    // Sequential Tier Lock Check (BR-02, AC-PRC-01)
    if (batch.status === BatchStatus.LOCKED) {
      throw new AppError(
        409,
        ErrorCode.TIER_LOCKED,
        `Prerequisite tier must be completed before starting ${tier} tier.`
      );
    }

    // Idempotency / No Re-Billing: Return existing batch without re-generating or re-billing quota
    if (
      (batch.status === BatchStatus.IN_PROGRESS ||
        batch.status === BatchStatus.COMPLETED) &&
      batch.questions.length === MCQ_BATCH_SIZE
    ) {
      if (
        session.practiceState.activeTier !== tier ||
        session.lastActiveMode !== LearningMode.PRACTICE
      ) {
        session.practiceState.activeTier = tier;
        session.lastActiveMode = LearningMode.PRACTICE;
        session.markModified('practiceState');
        await this.sessionRepo.save(session);
      }
      return { session: toTopicSessionDTO(session), quota: await reservation?.release() };
    }

    const profile = await resolveLearnerProfile(learner, this.userRepo);

    const systemInstruction = PromptBuilder.buildSystemInstruction(
      profile,
      LearningMode.PRACTICE
    );
    const prompt = PromptBuilder.buildPracticeGeneratePrompt(
      session.topicQuery,
      tier
    );

    const output = await generateStructuredOutput<PracticeBatchGenerationDTO>({
      operation: AiOperation.PRACTICE_GENERATE,
      systemInstruction,
      prompt,
      responseSchema: practiceBatchGeminiSchema,
      zodSchema: PracticeBatchGenerationSchema,
    });

    if (!output.questions || output.questions.length !== MCQ_BATCH_SIZE) {
      throw new AppError(
        502,
        ErrorCode.AI_UPSTREAM_FAILURE,
        `Expected exactly ${MCQ_BATCH_SIZE} questions from AI.`
      );
    }

    const batchPath = `practiceState.batches.${tier}`;
    const set: Record<string, unknown> = {
      'practiceState.activeTier': tier,
      [`${batchPath}.status`]: BatchStatus.IN_PROGRESS,
      [`${batchPath}.questions`]: output.questions.map((q) => ({
        questionNumber: q.questionNumber,
        questionText: q.questionText.trim(),
        options: q.options.map((opt) => opt.trim()),
        hint: q.hint.trim(),
        solutionExplanation: q.solutionExplanation.trim(),
        correctOptionIndex: q.correctOptionIndex,
      })),
      [`${batchPath}.userAnswers`]: [],
      [`${batchPath}.score`]: null,
      [`${batchPath}.completedAt`]: null,
      lastActiveMode: LearningMode.PRACTICE,
    };
    if (output.normalizedTitle && output.normalizedTitle.trim().length > 0) {
      set.normalizedTitle = output.normalizedTitle.trim();
    }

    // Filtered save: write only while the batch is still un-generated, i.e. the negation
    // of the idempotency check above, so a concurrent generator cannot overwrite (A-07).
    const saved = await this.sessionRepo.setIfMatches(
      session._id,
      {
        $or: [
          {
            [`${batchPath}.status`]: {
              $nin: [BatchStatus.IN_PROGRESS, BatchStatus.COMPLETED],
            },
          },
          { [`${batchPath}.questions.${MCQ_BATCH_SIZE - 1}`]: { $exists: false } },
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

    return { session: toTopicSessionDTO(saved), quota: reservation?.commit() };
  }

  /**
   * Submits and deterministically grades a 10-MCQ batch in O(1) time.
   * - Verifies batch is eligible for submission (throws 409 TIER_LOCKED if locked, 400 if not generated).
   * - Validates exactly 10 answers (0..3).
   * - Deterministic O(1) grading: never calls an LLM to grade (AGENTS.md Section H, FR-016).
   * - Unlocks next tier: easy -> medium, medium -> hard (BR-02, AC-PRC-03).
   * - Does NOT increment daily AI quota (BR-04).
   * - Returns unmasked TopicSessionDTO with full solutionExplanation and correctOptionIndex (BR-03).
   */
  async submitBatch(
    userId: string | undefined,
    sessionId: string,
    tier: PracticeTier,
    answers: number[]
  ): Promise<TopicSessionDTO> {
    const session = await this.sessionRepo.findSession(sessionId, userId);
    if (!session) {
      throw new AppError(
        404,
        ErrorCode.RESOURCE_NOT_FOUND,
        'Topic session not found.'
      );
    }

    const batch = session.practiceState?.batches?.[tier];
    if (!batch) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `Invalid practice tier: ${String(tier)}.`
      );
    }

    // Prerequisite lock verification
    if (batch.status === BatchStatus.LOCKED) {
      throw new AppError(
        409,
        ErrorCode.TIER_LOCKED,
        `Cannot submit locked batch for ${tier} tier.`
      );
    }

    // A graded batch is final: once submitted, the answer key is revealed, so a
    // second submission would let the learner overwrite their score (A-05).
    if (batch.status === BatchStatus.COMPLETED) {
      throw this.alreadySubmittedError();
    }

    // Must be generated before submission
    if (
      batch.status === BatchStatus.NOT_STARTED ||
      !batch.questions ||
      batch.questions.length !== MCQ_BATCH_SIZE
    ) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `Batch for ${tier} tier has not been generated yet.`
      );
    }

    // Validate 10 answers each 0..3
    if (!Array.isArray(answers) || answers.length !== MCQ_BATCH_SIZE) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `Expected exactly ${MCQ_BATCH_SIZE} answers.`
      );
    }

    for (let i = 0; i < MCQ_BATCH_SIZE; i++) {
      const ans = answers[i];
      if (
        typeof ans !== 'number' ||
        !Number.isInteger(ans) ||
        ans < 0 ||
        ans > 3
      ) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          `Answer at index ${i} must be an integer between 0 and 3.`
        );
      }
    }

    // Deterministic O(1) Grading
    let score = 0;
    for (let i = 0; i < MCQ_BATCH_SIZE; i++) {
      const q = batch.questions[i];
      if (q && answers[i] === q.correctOptionIndex) {
        score += 1;
      }
    }

    const batchPath = `practiceState.batches.${tier}`;
    const set: Record<string, unknown> = {
      [`${batchPath}.userAnswers`]: [...answers],
      [`${batchPath}.score`]: score,
      [`${batchPath}.status`]: BatchStatus.COMPLETED,
      [`${batchPath}.completedAt`]: new Date(),
      'practiceState.activeTier': tier,
      lastActiveMode: LearningMode.PRACTICE,
    };

    // Sequential Tier Unlocking (BR-02, AC-PRC-03)
    const nextTier =
      tier === PracticeTier.EASY
        ? PracticeTier.MEDIUM
        : tier === PracticeTier.MEDIUM
          ? PracticeTier.HARD
          : null;
    if (nextTier && session.practiceState.batches[nextTier].status === BatchStatus.LOCKED) {
      set[`practiceState.batches.${nextTier}.status`] = BatchStatus.NOT_STARTED;
    }

    // Filtered write: only lands while the batch is still in progress, so of two
    // concurrent submissions exactly one is graded and the other gets 409 (M-08).
    const saved = await this.sessionRepo.setIfMatches(
      session._id,
      { [`${batchPath}.status`]: BatchStatus.IN_PROGRESS },
      set
    );
    if (!saved) {
      throw this.alreadySubmittedError();
    }

    return toTopicSessionDTO(saved);
  }

  private alreadySubmittedError(): AppError {
    // A graded batch is final: its answer key is already revealed (A-05).
    return new AppError(409, ErrorCode.CONFLICT, 'This batch has already been submitted.');
  }
}

export const practiceService = new PracticeService();

