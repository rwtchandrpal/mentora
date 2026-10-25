import { z } from 'zod';
import {
  EducationLevelSchema,
  ExplanationStyleSchema,
  StaticLearnerProfileSchema,
  StaticLearnerProfileInputSchema,
  UserProfileStateSchema,
  QuotaMetaSchema,
  UsageQuotaDTOSchema,
} from '../schemas/profile.schema.js';
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  UserDTOSchema,
  AuthResponseDataSchema,
} from '../schemas/auth.schema.js';
import {
  ApiResponseMetaSchema,
  ApiErrorDetailSchema,
  ApiErrorEnvelopeSchema,
} from '../schemas/api-envelope.schema.js';

export type {
  EducationLevel,
  ExplanationStyle,
  LearningMode,
  PracticeTier,
  BatchStatus,
  MilestoneStatus,
  ErrorCode,
} from '../enums/index.js';

export type EducationLevelDTO = z.infer<typeof EducationLevelSchema>;
export type ExplanationStyleDTO = z.infer<typeof ExplanationStyleSchema>;
export type StaticLearnerProfileDTO = z.infer<typeof StaticLearnerProfileSchema>;
export type StaticLearnerProfileInputDTO = z.infer<typeof StaticLearnerProfileInputSchema>;
export type UserProfileStateDTO = z.infer<typeof UserProfileStateSchema>;
export type QuotaMetaDTO = z.infer<typeof QuotaMetaSchema>;
export type UsageQuotaDTO = z.infer<typeof UsageQuotaDTOSchema>;

export type RegisterRequestDTO = z.infer<typeof RegisterRequestSchema>;
export type LoginRequestDTO = z.infer<typeof LoginRequestSchema>;
export type UserDTO = z.infer<typeof UserDTOSchema>;
export type AuthResponseDataDTO = z.infer<typeof AuthResponseDataSchema>;

export type ApiResponseMetaDTO = z.infer<typeof ApiResponseMetaSchema>;
export type ApiErrorDetailDTO = z.infer<typeof ApiErrorDetailSchema>;
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: ApiResponseMetaDTO;
}

export type ApiResponseEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;
