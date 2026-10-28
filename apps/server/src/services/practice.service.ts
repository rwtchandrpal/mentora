import {
  ErrorCode,
  PracticeTier,
  BatchStatus,
  LearningMode,
  MCQ_BATCH_SIZE,
  TopicSessionDTO,
  PracticeBatchGenerationDTO,
  PracticeBatchGenerationSchema,
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
import { practiceBatchGeminiSchema } from '../ai/schemas/index.js';
import { toTopicSessionDTO } from './session.service.js';
import { AiOperation } from '../ai/model.router.js';

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
   * - Saves questions with status = 'in_progress', increments user quota, and returns masked DTO (BR-03).
   */
  async generateBatch(
    userId: string,
    sessionId: string,
    tier: PracticeTier
  ): Promise<TopicSessionDTO> {
    const session = await this.sessionRepo.findByIdAndUserId(sessionId, userId);
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
      return toTopicSessionDTO(session);
    }

    // Validate learner profile completion (BR-01)
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

    if (output.normalizedTitle && output.normalizedTitle.trim().length > 0) {
      session.normalizedTitle = output.normalizedTitle.trim();
    }

    if (!output.questions || output.questions.length !== MCQ_BATCH_SIZE) {
      throw new AppError(
        502,
        ErrorCode.AI_UPSTREAM_FAILURE,
        `Expected exactly ${MCQ_BATCH_SIZE} questions from AI.`
      );
    }

    session.practiceState.activeTier = tier;
    session.practiceState.batches[tier].status = BatchStatus.IN_PROGRESS;
    session.practiceState.batches[tier].questions = output.questions.map((q) => ({
      questionNumber: q.questionNumber,
      questionText: q.questionText.trim(),
      options: q.options.map((opt) => opt.trim()),
      hint: q.hint.trim(),
      solutionExplanation: q.solutionExplanation.trim(),
      correctOptionIndex: q.correctOptionIndex,
    }));
    session.practiceState.batches[tier].userAnswers = [];
    session.practiceState.batches[tier].score = null;
    session.practiceState.batches[tier].completedAt = null;
    session.lastActiveMode = LearningMode.PRACTICE;

    session.markModified('practiceState');
    const savedSession = await this.sessionRepo.save(session);
    await this.userRepo.incrementUserQuota(userId);

    return toTopicSessionDTO(savedSession);
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
    userId: string,
    sessionId: string,
    tier: PracticeTier,
    answers: number[]
  ): Promise<TopicSessionDTO> {
    const session = await this.sessionRepo.findByIdAndUserId(sessionId, userId);
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

    batch.userAnswers = [...answers];
    batch.score = score;
    batch.status = BatchStatus.COMPLETED;
    batch.completedAt = new Date();
    session.practiceState.activeTier = tier;
    session.lastActiveMode = LearningMode.PRACTICE;

    // Sequential Tier Unlocking (BR-02, AC-PRC-03)
    if (tier === PracticeTier.EASY) {
      if (session.practiceState.batches.medium.status === BatchStatus.LOCKED) {
        session.practiceState.batches.medium.status = BatchStatus.NOT_STARTED;
      }
    } else if (tier === PracticeTier.MEDIUM) {
      if (session.practiceState.batches.hard.status === BatchStatus.LOCKED) {
        session.practiceState.batches.hard.status = BatchStatus.NOT_STARTED;
      }
    }

    session.markModified('practiceState');
    const savedSession = await this.sessionRepo.save(session);

    return toTopicSessionDTO(savedSession);
  }
}

export const practiceService = new PracticeService();

