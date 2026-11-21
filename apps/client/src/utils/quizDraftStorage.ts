import type { PracticeTier } from '@mentora/shared';

/** localStorage prefix for mid-quiz Practice drafts (Edge Case 5). */
export const QUIZ_DRAFT_KEY_PREFIX = 'mentora_quiz_draft_';

export const getQuizDraftStorageKey = (sessionId: string, tier: PracticeTier): string =>
  `${QUIZ_DRAFT_KEY_PREFIX}${sessionId}_${tier}`;

/**
 * Removes saved quiz drafts: every draft when called without a session ID (logout), or
 * only that session's drafts (session deleted). Drafts otherwise outlive the session and
 * stay readable on shared devices (L-12).
 */
export const clearQuizDrafts = (sessionId?: string): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const prefix = sessionId ? `${QUIZ_DRAFT_KEY_PREFIX}${sessionId}_` : QUIZ_DRAFT_KEY_PREFIX;
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // localStorage disabled or throwing: nothing to clear.
  }
};
