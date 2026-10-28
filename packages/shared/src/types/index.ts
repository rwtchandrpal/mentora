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
  ErrorCodeSchema,
  ApiResponseMetaSchema,
  ApiErrorDetailSchema,
  ApiErrorEnvelopeSchema,
} from '../schemas/api-envelope.schema.js';
import {
  ExplainStepTypeSchema,
  ExplainStatusSchema,
  DeepDiveSubCardSchema,
  ExplainCardSchema,
  ExplainInitOutputSchema,
  ExplainDeepDiveOutputSchema,
  ExplainStepRequestSchema,
  ExplainDeeperRequestSchema,
  ExplainStateSchema,
} from '../schemas/explain.schema.js';
import {
  MilestoneStatusSchema,
  InteractStatusSchema,
  ChatRoleSchema,
  SocraticOutcomeSchema,
  InteractMilestoneSchema,
  InteractMessageSchema,
  InteractInitOutputSchema,
  InteractStreamRequestSchema,
  MentoraStreamControlHeaderSchema,
  SseStartEventSchema,
  SseTokenEventSchema,
  SseMetadataEventSchema,
  SseErrorEventSchema,
  InteractStateSchema,
} from '../schemas/interact.schema.js';
import {
  PracticeTierSchema,
  BatchStatusSchema,
  McqQuestionFullSchema,
  McqQuestionMaskedSchema,
  PracticeBatchGenerationSchema,
  PracticeGenerateRequestSchema,
  PracticeSubmitRequestSchema,
  PracticeBatchFullSchema,
  PracticeBatchDTOSchema,
  PracticeStateFullSchema,
  PracticeStateDTOSchema,
  QuizDraftStorageSchema,
} from '../schemas/practice.schema.js';
import {
  LearningModeSchema,
  CreateSessionRequestSchema,
  SwitchModeRequestSchema,
  SessionSummaryDTOSchema,
  TopicSessionDTOSchema,
  TopicSessionFullSchema,
} from '../schemas/session.schema.js';

export type {
  EducationLevel,
  ExplanationStyle,
  LearningMode,
  PracticeTier,
  BatchStatus,
  MilestoneStatus,
  ErrorCode,
  ExplainStepType,
  ExplainStatus,
  InteractStatus,
  ChatRole,
  SocraticOutcome,
} from '../enums/index.js';

// Profile & Auth Types
export type EducationLevelDTO = z.infer<typeof EducationLevelSchema>;
export type ExplanationStyleDTO = z.infer<typeof ExplanationStyleSchema>;
export type StaticLearnerProfileDTO = z.infer<typeof StaticLearnerProfileSchema>;
export type StaticLearnerProfile = StaticLearnerProfileDTO;
export type StaticLearnerProfileInputDTO = z.infer<typeof StaticLearnerProfileInputSchema>;
export type UserProfileStateDTO = z.infer<typeof UserProfileStateSchema>;
export type QuotaMetaDTO = z.infer<typeof QuotaMetaSchema>;
export type UsageQuotaDTO = z.infer<typeof UsageQuotaDTOSchema>;

export type RegisterRequestDTO = z.infer<typeof RegisterRequestSchema>;
export type LoginRequestDTO = z.infer<typeof LoginRequestSchema>;
export type UserDTO = z.infer<typeof UserDTOSchema>;
export type AuthResponseDataDTO = z.infer<typeof AuthResponseDataSchema>;

// API Envelope Types
export type ErrorCodeDTO = z.infer<typeof ErrorCodeSchema>;
export type ApiResponseMetaDTO = z.infer<typeof ApiResponseMetaSchema>;
export type ApiErrorDetailDTO = z.infer<typeof ApiErrorDetailSchema>;
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: ApiResponseMetaDTO;
}

export type ApiResponseEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

// Explain Mode Types
export type ExplainStepTypeDTO = z.infer<typeof ExplainStepTypeSchema>;
export type ExplainStatusDTO = z.infer<typeof ExplainStatusSchema>;
export type DeepDiveSubCardDTO = z.infer<typeof DeepDiveSubCardSchema>;
export type ExplainCardDTO = z.infer<typeof ExplainCardSchema>;
export type ExplainInitOutputDTO = z.infer<typeof ExplainInitOutputSchema>;
export type ExplainDeepDiveOutputDTO = z.infer<typeof ExplainDeepDiveOutputSchema>;
export type ExplainStepRequestDTO = z.infer<typeof ExplainStepRequestSchema>;
export type ExplainDeeperRequestDTO = z.infer<typeof ExplainDeeperRequestSchema>;
export type ExplainStateDTO = z.infer<typeof ExplainStateSchema>;

// Interact Mode Types
export type MilestoneStatusDTO = z.infer<typeof MilestoneStatusSchema>;
export type InteractStatusDTO = z.infer<typeof InteractStatusSchema>;
export type ChatRoleDTO = z.infer<typeof ChatRoleSchema>;
export type SocraticOutcomeDTO = z.infer<typeof SocraticOutcomeSchema>;
export type InteractMilestoneDTO = z.infer<typeof InteractMilestoneSchema>;
export type InteractMessageDTO = z.infer<typeof InteractMessageSchema>;
export type InteractInitOutputDTO = z.infer<typeof InteractInitOutputSchema>;
export type InteractStreamRequestDTO = z.infer<typeof InteractStreamRequestSchema>;
export type MentoraStreamControlHeaderDTO = z.infer<typeof MentoraStreamControlHeaderSchema>;
export type SseStartEventDTO = z.infer<typeof SseStartEventSchema>;
export type SseTokenEventDTO = z.infer<typeof SseTokenEventSchema>;
export type SseMetadataEventDTO = z.infer<typeof SseMetadataEventSchema>;
export type SseErrorEventDTO = z.infer<typeof SseErrorEventSchema>;
export type InteractStateDTO = z.infer<typeof InteractStateSchema>;

// Practice Mode Types
export type PracticeTierDTO = z.infer<typeof PracticeTierSchema>;
export type BatchStatusDTO = z.infer<typeof BatchStatusSchema>;
export type McqQuestionFullDTO = z.infer<typeof McqQuestionFullSchema>;
export type McqQuestionMaskedDTO = z.infer<typeof McqQuestionMaskedSchema>;
export type PracticeBatchGenerationDTO = z.infer<typeof PracticeBatchGenerationSchema>;
export type PracticeGenerateRequestDTO = z.infer<typeof PracticeGenerateRequestSchema>;
export type PracticeSubmitRequestDTO = z.infer<typeof PracticeSubmitRequestSchema>;
export type PracticeBatchFullDTO = z.infer<typeof PracticeBatchFullSchema>;
export type PracticeBatchDTO = z.infer<typeof PracticeBatchDTOSchema>;
export type PracticeStateFullDTO = z.infer<typeof PracticeStateFullSchema>;
export type PracticeStateDTO = z.infer<typeof PracticeStateDTOSchema>;
export type QuizDraftStorageDTO = z.infer<typeof QuizDraftStorageSchema>;

// Session Types
export type LearningModeDTO = z.infer<typeof LearningModeSchema>;
export type CreateSessionRequestDTO = z.infer<typeof CreateSessionRequestSchema>;
export type SwitchModeRequestDTO = z.infer<typeof SwitchModeRequestSchema>;
export type SessionSummaryDTO = z.infer<typeof SessionSummaryDTOSchema>;
export type TopicSessionDTO = z.infer<typeof TopicSessionDTOSchema>;
export type TopicSessionFullDTO = z.infer<typeof TopicSessionFullSchema>;
