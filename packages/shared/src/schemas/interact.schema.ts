import { z } from 'zod';
import {
  MIN_INTERACT_MILESTONES,
  MAX_INTERACT_MILESTONES,
  MAX_INTERACT_MESSAGE_LENGTH,
  MAX_SOCRATIC_STRIKES,
} from '../constants/index.js';
import {
  MILESTONE_STATUSES,
  INTERACT_STATUSES,
  CHAT_ROLES,
  SOCRATIC_OUTCOMES,
} from '../enums/index.js';
import { ErrorCodeSchema } from './api-envelope.schema.js';
import { QuotaMetaSchema } from './profile.schema.js';

export const MilestoneStatusSchema = z.enum(MILESTONE_STATUSES);
export const InteractStatusSchema = z.enum(INTERACT_STATUSES);
export const ChatRoleSchema = z.enum(CHAT_ROLES);
export const SocraticOutcomeSchema = z.enum(SOCRATIC_OUTCOMES);

export const InteractMilestoneSchema = z.object({
  milestoneNumber: z.number().int().min(1).max(MAX_INTERACT_MILESTONES),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  status: MilestoneStatusSchema,
});

export const InteractMessageSchema = z.object({
  id: z.string().min(1),
  role: ChatRoleSchema,
  content: z.string().min(1),
  milestoneNumber: z.number().int().min(1).max(MAX_INTERACT_MILESTONES),
  strikeNumberAtTurn: z.number().int().min(0).max(MAX_SOCRATIC_STRIKES).default(0),
  isCircuitBreakerExplanation: z.boolean().default(false),
  createdAt: z.string(),
});

export const InteractInitMilestoneSchema = InteractMilestoneSchema.omit({ status: true }).extend({
  status: MilestoneStatusSchema.optional(),
});

export const InteractInitOutputSchema = z
  .object({
    isEducationalValid: z.boolean(),
    refusalReason: z.string().nullable().optional(),
    normalizedTitle: z.string().trim().optional(),
    milestones: z.array(InteractInitMilestoneSchema).default([]),
    openingQuestion: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.isEducationalValid) {
      if (
        data.milestones.length < MIN_INTERACT_MILESTONES ||
        data.milestones.length > MAX_INTERACT_MILESTONES
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Milestones count must be between ${MIN_INTERACT_MILESTONES} and ${MAX_INTERACT_MILESTONES} inclusive`,
          path: ['milestones'],
        });
      }
      if (!data.openingQuestion || data.openingQuestion.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'openingQuestion is required and cannot be empty when isEducationalValid is true',
          path: ['openingQuestion'],
        });
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

export const InteractStreamRequestSchema = z.object({
  message: z.string().trim().min(1).max(MAX_INTERACT_MESSAGE_LENGTH),
  forceDirectExplanation: z.boolean().optional().default(false),
});

export const MentoraStreamControlHeaderSchema = z.object({
  outcome: SocraticOutcomeSchema,
});

export const SseStartEventSchema = z.object({
  turnId: z.string().min(1),
  activeMilestoneIndex: z.number().int().min(0),
});

export const SseTokenEventSchema = z.object({
  delta: z.string(),
});

export const SseMetadataEventSchema = z.object({
  activeMilestoneIndex: z.number().int().min(0),
  strikeCount: z.number().int().min(0).max(MAX_SOCRATIC_STRIKES - 1),
  milestones: z.array(InteractMilestoneSchema),
  isCompleted: z.boolean(),
  userMessage: InteractMessageSchema.optional(),
  assistantMessage: InteractMessageSchema.optional(),
  quota: QuotaMetaSchema.optional(),
});

export const SseErrorEventSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
});

export const InteractStateSchema = z.object({
  status: InteractStatusSchema,
  activeMilestoneIndex: z.number().int().min(0),
  strikeCount: z.number().int().min(0).max(MAX_SOCRATIC_STRIKES - 1),
  milestones: z.array(InteractMilestoneSchema),
  messages: z.array(InteractMessageSchema),
});
