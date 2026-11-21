import { EducationLevel, ExplanationStyle } from '../enums/index.js';

export const DAILY_AI_QUOTA_LIMIT = 50 as const;
export const GUEST_DAILY_AI_QUOTA_LIMIT = 15 as const;
export const GUEST_SESSION_TTL_SECONDS = 7200 as const;
export const GUEST_TOKEN_HEADER = 'X-Guest-Token' as const;
export const MAX_SOCRATIC_STRIKES = 3 as const;
export const MCQ_BATCH_SIZE = 10 as const;
export const MCQ_OPTIONS_COUNT = 4 as const;
export const EXPLAIN_CORE_STEPS_COUNT = 4 as const;
export const MIN_INTERACT_MILESTONES = 3 as const;
export const MAX_INTERACT_MILESTONES = 5 as const;
export const MAX_TOPIC_QUERY_LENGTH = 300 as const;
export const MAX_INTERACT_MESSAGE_LENGTH = 2000 as const;
/**
 * Number of most recent Interact messages included in each Socratic turn prompt.
 * Older context is carried by the milestone roadmap, so the prompt stays bounded.
 */
export const MAX_INTERACT_PROMPT_HISTORY = 20 as const;
export const MAX_DEEP_DIVE_DEPTH = 2 as const;
export const MIN_USER_NAME_LENGTH = 2 as const;
export const MAX_USER_NAME_LENGTH = 80 as const;
export const MIN_PASSWORD_LENGTH = 8 as const;
export const MAX_PASSWORD_LENGTH = 128 as const;

export const DEFAULT_GUEST_PROFILE = {
  educationLevel: EducationLevel.UNDERGRADUATE,
  preferredStyle: ExplanationStyle.VISUAL,
} as const;
