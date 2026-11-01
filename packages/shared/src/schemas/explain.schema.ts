import { z } from 'zod';
import {
  EXPLAIN_CORE_STEPS_COUNT,
  MAX_DEEP_DIVE_DEPTH,
} from '../constants/index.js';
import {
  EXPLAIN_STEP_TYPES,
  EXPLAIN_STATUSES,
  ExplainStepType,
} from '../enums/index.js';

export const ExplainStepTypeSchema = z.enum(EXPLAIN_STEP_TYPES);
export const ExplainStatusSchema = z.enum(EXPLAIN_STATUSES);

export const DeepDiveSubCardSchema = z.object({
  id: z.string().min(1),
  depthLevel: z.number().int().min(1).max(MAX_DEEP_DIVE_DEPTH).default(1),
  title: z.string().trim().min(1),
  contentMarkdown: z.string().trim().min(1),
  createdAt: z.string(),
});

export const ExplainCardSchema = z.object({
  stepNumber: z.number().int().min(1).max(EXPLAIN_CORE_STEPS_COUNT),
  stepType: ExplainStepTypeSchema,
  title: z.string().trim().min(1),
  contentMarkdown: z.string().trim().min(1),
  checkQuestion: z.string().nullable().optional(),
  checkAnswer: z.string().nullable().optional(),
  deepDives: z.array(DeepDiveSubCardSchema).default([]),
});

export const ExplainInitCardSchema = ExplainCardSchema.omit({ deepDives: true }).extend({
  deepDives: z.array(DeepDiveSubCardSchema).default([]),
});

export const ExplainInitOutputSchema = z
  .object({
    isEducationalValid: z.boolean(),
    refusalReason: z.string().nullable().optional(),
    normalizedTitle: z.string().trim().optional(),
    cards: z.array(ExplainInitCardSchema).default([]),
    suggestedSubTopics: z.array(z.string()).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.isEducationalValid) {
      if (data.cards.length !== EXPLAIN_CORE_STEPS_COUNT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Explain cards must have exactly ${EXPLAIN_CORE_STEPS_COUNT} cards when isEducationalValid is true`,
          path: ['cards'],
        });
        return;
      }
      const expectedStepTypes: readonly ExplainStepType[] = [
        ExplainStepType.INTUITION,
        ExplainStepType.CORE_MECHANISM,
        ExplainStepType.EXAMPLE,
        ExplainStepType.CHECK_FOR_UNDERSTANDING,
      ];
      for (let i = 0; i < EXPLAIN_CORE_STEPS_COUNT; i++) {
        const card = data.cards[i];
        if (!card) continue;
        if (card.stepNumber !== i + 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Card at index ${i} must have stepNumber ${i + 1}`,
            path: ['cards', i, 'stepNumber'],
          });
        }
        if (card.stepType !== expectedStepTypes[i]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Card at index ${i} must have stepType "${expectedStepTypes[i]}"`,
            path: ['cards', i, 'stepType'],
          });
        }
        if (card.stepType === ExplainStepType.CHECK_FOR_UNDERSTANDING) {
          if (!card.checkQuestion || card.checkQuestion.trim().length === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Card 4 (check_for_understanding) must have a non-empty checkQuestion',
              path: ['cards', i, 'checkQuestion'],
            });
          }
          if (!card.checkAnswer || card.checkAnswer.trim().length === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Card 4 (check_for_understanding) must have a non-empty checkAnswer',
              path: ['cards', i, 'checkAnswer'],
            });
          }
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

export const ExplainDeepDiveOutputSchema = z.object({
  title: z.string().trim().min(1),
  contentMarkdown: z.string().trim().min(1),
});

export const ExplainStepRequestSchema = z
  .object({
    currentStepIndex: z
      .number()
      .int()
      .min(0)
      .max(EXPLAIN_CORE_STEPS_COUNT - 1)
      .optional(),
    stepIndex: z
      .number()
      .int()
      .min(0)
      .max(EXPLAIN_CORE_STEPS_COUNT - 1)
      .optional(),
  })
  .refine(
    (data) => data.currentStepIndex !== undefined || data.stepIndex !== undefined,
    {
      message:
        'Either currentStepIndex or stepIndex must be provided as an integer between 0 and 3.',
    }
  );

export const ExplainDeeperRequestSchema = z.object({
  stepNumber: z.number().int().min(1).max(EXPLAIN_CORE_STEPS_COUNT),
});

export const ExplainStateSchema = z.object({
  status: ExplainStatusSchema,
  currentStepIndex: z.number().int().min(0).max(EXPLAIN_CORE_STEPS_COUNT - 1),
  cards: z.array(ExplainCardSchema),
  suggestedSubTopics: z.array(z.string()).default([]),
});
