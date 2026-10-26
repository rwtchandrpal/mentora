import { z } from 'zod';
import {
  MCQ_BATCH_SIZE,
  MCQ_OPTIONS_COUNT,
} from '../constants/index.js';
import {
  PRACTICE_TIERS,
  BATCH_STATUSES,
  BatchStatus,
} from '../enums/index.js';

export const PracticeTierSchema = z.enum(PRACTICE_TIERS);
export const BatchStatusSchema = z.enum(BATCH_STATUSES);

export const MCQ_QUESTION_FULL_KEY_ORDER = [
  'questionNumber',
  'questionText',
  'options',
  'hint',
  'solutionExplanation',
  'correctOptionIndex',
] as const;

export const McqQuestionFullSchema = z.object({
  questionNumber: z.number().int().min(1).max(MCQ_BATCH_SIZE),
  questionText: z.string().trim().min(1),
  options: z.array(z.string().min(1)).length(MCQ_OPTIONS_COUNT),
  hint: z.string().trim().min(1),
  solutionExplanation: z.string().trim().min(1),
  correctOptionIndex: z.number().int().min(0).max(MCQ_OPTIONS_COUNT - 1),
});

export const McqQuestionMaskedSchema = McqQuestionFullSchema.omit({
  correctOptionIndex: true,
  solutionExplanation: true,
});

export const PracticeBatchGenerationSchema = z
  .object({
    isEducationalValid: z.boolean(),
    refusalReason: z.string().nullable().optional(),
    normalizedTitle: z.string().trim().optional(),
    questions: z.array(McqQuestionFullSchema).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.isEducationalValid) {
      if (data.questions.length !== MCQ_BATCH_SIZE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Practice questions must have exactly ${MCQ_BATCH_SIZE} questions when isEducationalValid is true`,
          path: ['questions'],
        });
        return;
      }
      for (let i = 0; i < MCQ_BATCH_SIZE; i++) {
        const q = data.questions[i];
        if (!q) continue;
        if (q.questionNumber !== i + 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Question at index ${i} must have questionNumber ${i + 1}`,
            path: ['questions', i, 'questionNumber'],
          });
        }
      }
    } else {
      if (!data.refusalReason || data.refusalReason.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'refusalReason is required and cannot be empty when isEducationalValid is false',
          path: ['refusalReason'],
        });
      }
    }
  });

export const PracticeGenerateRequestSchema = z.object({
  tier: PracticeTierSchema,
});

export const PracticeSubmitRequestSchema = z.object({
  tier: PracticeTierSchema,
  answers: z
    .array(z.number().int().min(0).max(MCQ_OPTIONS_COUNT - 1))
    .length(MCQ_BATCH_SIZE),
});

export const PracticeBatchFullSchema = z.object({
  tier: PracticeTierSchema,
  status: BatchStatusSchema,
  score: z.number().int().min(0).max(MCQ_BATCH_SIZE).nullable(),
  questions: z.array(McqQuestionFullSchema),
  userAnswers: z.array(z.number().int().min(0).max(MCQ_OPTIONS_COUNT - 1)),
  completedAt: z.string().nullable(),
});

export const PracticeBatchLockedDTOSchema = z.object({
  tier: PracticeTierSchema,
  status: z.literal(BatchStatus.LOCKED),
  score: z.number().int().min(0).max(MCQ_BATCH_SIZE).nullable().default(null),
  questions: z.array(McqQuestionMaskedSchema).default([]),
  userAnswers: z.array(z.number().int().min(0).max(MCQ_OPTIONS_COUNT - 1)).default([]),
  completedAt: z.string().nullable().default(null),
});

export const PracticeBatchNotStartedDTOSchema = z.object({
  tier: PracticeTierSchema,
  status: z.literal(BatchStatus.NOT_STARTED),
  score: z.number().int().min(0).max(MCQ_BATCH_SIZE).nullable().default(null),
  questions: z.array(McqQuestionMaskedSchema).default([]),
  userAnswers: z.array(z.number().int().min(0).max(MCQ_OPTIONS_COUNT - 1)).default([]),
  completedAt: z.string().nullable().default(null),
});

export const PracticeBatchInProgressDTOSchema = z.object({
  tier: PracticeTierSchema,
  status: z.literal(BatchStatus.IN_PROGRESS),
  score: z.number().int().min(0).max(MCQ_BATCH_SIZE).nullable().default(null),
  questions: z.array(McqQuestionMaskedSchema).default([]),
  userAnswers: z.array(z.number().int().min(0).max(MCQ_OPTIONS_COUNT - 1)).default([]),
  completedAt: z.string().nullable().default(null),
});

export const PracticeBatchCompletedDTOSchema = z.object({
  tier: PracticeTierSchema,
  status: z.literal(BatchStatus.COMPLETED),
  score: z.number().int().min(0).max(MCQ_BATCH_SIZE).nullable().default(null),
  questions: z.array(McqQuestionFullSchema).default([]),
  userAnswers: z.array(z.number().int().min(0).max(MCQ_OPTIONS_COUNT - 1)).default([]),
  completedAt: z.string().nullable().default(null),
});

export const PracticeBatchDTOSchema = z.discriminatedUnion('status', [
  PracticeBatchLockedDTOSchema,
  PracticeBatchNotStartedDTOSchema,
  PracticeBatchInProgressDTOSchema,
  PracticeBatchCompletedDTOSchema,
]);

export const PracticeStateFullSchema = z.object({
  activeTier: PracticeTierSchema,
  batches: z.object({
    easy: PracticeBatchFullSchema,
    medium: PracticeBatchFullSchema,
    hard: PracticeBatchFullSchema,
  }),
});

export const PracticeStateDTOSchema = z.object({
  activeTier: PracticeTierSchema,
  batches: z.object({
    easy: PracticeBatchDTOSchema,
    medium: PracticeBatchDTOSchema,
    hard: PracticeBatchDTOSchema,
  }),
});

export const QuizDraftStorageSchema = z.object({
  sessionId: z.string().min(1),
  tier: PracticeTierSchema,
  selectedAnswers: z.union([
    z.array(z.number().int().min(0).max(MCQ_OPTIONS_COUNT - 1).nullable()).length(MCQ_BATCH_SIZE),
    z.record(z.string(), z.number().int().min(0).max(MCQ_OPTIONS_COUNT - 1)),
  ]),
  updatedAt: z.string(),
});
