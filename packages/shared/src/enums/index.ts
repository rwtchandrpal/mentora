export const EducationLevel = {
  HIGH_SCHOOL: 'high_school',
  UNDERGRADUATE: 'undergraduate',
  PROFESSIONAL: 'professional',
} as const;
export type EducationLevel = (typeof EducationLevel)[keyof typeof EducationLevel];

export const EDUCATION_LEVELS = [
  EducationLevel.HIGH_SCHOOL,
  EducationLevel.UNDERGRADUATE,
  EducationLevel.PROFESSIONAL,
] as const;

export const ExplanationStyle = {
  VISUAL: 'visual',
  ANALOGY_HEAVY: 'analogy_heavy',
  CONCISE_TECHNICAL: 'concise_technical',
} as const;
export type ExplanationStyle = (typeof ExplanationStyle)[keyof typeof ExplanationStyle];

export const EXPLANATION_STYLES = [
  ExplanationStyle.VISUAL,
  ExplanationStyle.ANALOGY_HEAVY,
  ExplanationStyle.CONCISE_TECHNICAL,
] as const;

export const LearningMode = {
  EXPLAIN: 'explain',
  INTERACT: 'interact',
  PRACTICE: 'practice',
} as const;
export type LearningMode = (typeof LearningMode)[keyof typeof LearningMode];

export const LEARNING_MODES = [
  LearningMode.EXPLAIN,
  LearningMode.INTERACT,
  LearningMode.PRACTICE,
] as const;

export const PracticeTier = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
} as const;
export type PracticeTier = (typeof PracticeTier)[keyof typeof PracticeTier];

export const PRACTICE_TIERS = [
  PracticeTier.EASY,
  PracticeTier.MEDIUM,
  PracticeTier.HARD,
] as const;

export const BatchStatus = {
  LOCKED: 'locked',
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;
export type BatchStatus = (typeof BatchStatus)[keyof typeof BatchStatus];

export const BATCH_STATUSES = [
  BatchStatus.LOCKED,
  BatchStatus.NOT_STARTED,
  BatchStatus.IN_PROGRESS,
  BatchStatus.COMPLETED,
] as const;

export const MilestoneStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
} as const;
export type MilestoneStatus = (typeof MilestoneStatus)[keyof typeof MilestoneStatus];

export const MILESTONE_STATUSES = [
  MilestoneStatus.PENDING,
  MilestoneStatus.ACTIVE,
  MilestoneStatus.COMPLETED,
] as const;

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  PROFILE_INCOMPLETE: 'PROFILE_INCOMPLETE',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  TIER_LOCKED: 'TIER_LOCKED',
  EDUCATIONAL_GUARDRAIL_REFUSAL: 'EDUCATIONAL_GUARDRAIL_REFUSAL',
  DAILY_QUOTA_EXCEEDED: 'DAILY_QUOTA_EXCEEDED',
  AI_UPSTREAM_FAILURE: 'AI_UPSTREAM_FAILURE',
  STREAM_INTERRUPTED: 'STREAM_INTERRUPTED',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ERROR_CODES = [
  ErrorCode.VALIDATION_ERROR,
  ErrorCode.UNAUTHORIZED,
  ErrorCode.PROFILE_INCOMPLETE,
  ErrorCode.RESOURCE_NOT_FOUND,
  ErrorCode.TIER_LOCKED,
  ErrorCode.EDUCATIONAL_GUARDRAIL_REFUSAL,
  ErrorCode.DAILY_QUOTA_EXCEEDED,
  ErrorCode.AI_UPSTREAM_FAILURE,
  ErrorCode.STREAM_INTERRUPTED,
  ErrorCode.INTERNAL_SERVER_ERROR,
] as const;
