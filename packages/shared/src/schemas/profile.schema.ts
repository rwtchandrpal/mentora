import { z } from 'zod';
import { EDUCATION_LEVELS, EXPLANATION_STYLES } from '../enums/index.js';
import { DAILY_AI_QUOTA_LIMIT } from '../constants/index.js';

export const EducationLevelSchema = z.enum(EDUCATION_LEVELS);
export const ExplanationStyleSchema = z.enum(EXPLANATION_STYLES);

export const StaticLearnerProfileSchema = z.object({
  educationLevel: EducationLevelSchema,
  preferredStyle: ExplanationStyleSchema,
});

export const StaticLearnerProfileInputSchema = z.object({
  educationLevel: EducationLevelSchema,
  preferredStyle: ExplanationStyleSchema,
});

export const IncompleteUserProfileSchema = z.object({
  isCompleted: z.literal(false),
  educationLevel: EducationLevelSchema.nullable().default(null),
  preferredStyle: ExplanationStyleSchema.nullable().default(null),
});

export const CompletedUserProfileSchema = z.object({
  isCompleted: z.literal(true),
  educationLevel: EducationLevelSchema,
  preferredStyle: ExplanationStyleSchema,
});

export const UserProfileStateSchema = z.discriminatedUnion('isCompleted', [
  IncompleteUserProfileSchema,
  CompletedUserProfileSchema,
]);

export const QuotaMetaSchema = z.object({
  used: z.number().int().min(0),
  limit: z.number().int().positive(),
  resetAt: z.string().datetime(),
});

export const UsageQuotaDTOSchema = z.object({
  dailyCount: z.number().int().min(0),
  dailyLimit: z.number().int().positive().default(DAILY_AI_QUOTA_LIMIT),
  windowResetAt: z.string(),
});
