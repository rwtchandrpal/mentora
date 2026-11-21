import { LearningMode } from '@mentora/shared';

/**
 * Client-side timeouts for requests that run AI work on the server.
 *
 * The server retries a failed structured generation once (2 attempts plus a
 * short back-off), so the client must wait for that worst case instead of the
 * 15 s axios default, otherwise it reports a timeout while the server is still
 * generating (and still charging quota).
 *
 * - Fast: operations routed to GEMINI_FAST_MODEL (explain/init, interact/init).
 * - Reasoning: operations routed to GEMINI_REASONING_MODEL (practice/generate).
 */
export const AI_FAST_TIMEOUT_MS = 45_000;
export const AI_REASONING_TIMEOUT_MS = 90_000;

/** Timeout for session creation, which auto-initializes the initial mode. */
export const getCreateSessionTimeoutMs = (initialMode: LearningMode | undefined): number =>
  initialMode === LearningMode.PRACTICE ? AI_REASONING_TIMEOUT_MS : AI_FAST_TIMEOUT_MS;
