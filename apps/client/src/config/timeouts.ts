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

/**
 * Back-off between `/health` probes while the API is unreachable (LIVE-BUG-H4): Render
 * restarts and cold starts were observed to take 45–110 s, so the schedule spans ~90 s
 * before the client gives up and reports the server as unavailable.
 */
export const SERVER_WAKE_RETRY_DELAYS_MS: readonly number[] = [
  2_000, 4_000, 8_000, 15_000, 15_000, 15_000, 15_000, 15_000,
];

/** Timeout for session creation, which auto-initializes the initial mode. */
export const getCreateSessionTimeoutMs = (initialMode: LearningMode | undefined): number =>
  initialMode === LearningMode.PRACTICE ? AI_REASONING_TIMEOUT_MS : AI_FAST_TIMEOUT_MS;

/**
 * Startup "server waking up" splash. If the first `/health` probe hasn't answered after
 * SHOW_AFTER_MS, a friendly banner explains the wait; probing continues every
 * POLL_INTERVAL_MS until the API answers or GIVE_UP_AFTER_MS passes. A cold Render
 * instance was observed to need 45–110 s.
 */
export const WAKE_SPLASH_SHOW_AFTER_MS = 1_500;
export const WAKE_SPLASH_POLL_INTERVAL_MS = 2_000;
export const WAKE_SPLASH_GIVE_UP_AFTER_MS = 180_000;
/** Rough cold-start duration the progress bar is paced against. */
export const WAKE_SPLASH_EXPECTED_MS = 60_000;
