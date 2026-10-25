import { z } from 'zod';
import { ERROR_CODES } from '../enums/index.js';
import { QuotaMetaSchema } from './profile.schema.js';

export const ErrorCodeSchema = z.enum(ERROR_CODES);

export const ApiResponseMetaSchema = z.object({
  quota: QuotaMetaSchema.optional(),
});

export const ApiErrorDetailSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const ApiErrorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: ApiErrorDetailSchema,
});

export const createApiSuccessEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: ApiResponseMetaSchema.optional(),
  });

export const ApiSuccessEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
  meta: ApiResponseMetaSchema.optional(),
});
