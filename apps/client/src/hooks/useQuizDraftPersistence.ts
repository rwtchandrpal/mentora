import { useState, useEffect, useCallback, useMemo } from 'react';
import { z } from 'zod';
import {
  PracticeTier,
  BatchStatus,
  MCQ_BATCH_SIZE,
  MCQ_OPTIONS_COUNT,
  QuizDraftStorageSchema,
} from '@mentora/shared';

export const getQuizDraftStorageKey = (sessionId: string, tier: PracticeTier): string =>
  `mentora_quiz_draft_${sessionId}_${tier}`;

const FallbackDraftRecordSchema = z.record(
  z.string(),
  z.number().int().min(0).max(MCQ_OPTIONS_COUNT - 1)
);

const FallbackDraftArraySchema = z
  .array(z.number().int().min(0).max(MCQ_OPTIONS_COUNT - 1).nullable())
  .length(MCQ_BATCH_SIZE);

export interface UseQuizDraftPersistenceOptions {
  sessionId: string | null | undefined;
  tier: PracticeTier;
  batchStatus: BatchStatus;
}

export interface UseQuizDraftPersistenceReturn {
  selectedAnswers: Record<number, number>;
  answersArray: (number | null)[];
  selectOption: (questionIndex: number, optionIndex: number) => void;
  clearDraft: () => void;
  answeredCount: number;
  isComplete: boolean;
  getAnswersArray: () => number[];
}

/**
 * Validates and parses raw localStorage string into a Record<number, number>.
 * Returns empty object if missing, invalid JSON, or failing Zod validation (Edge Case 5).
 */
const parseDraftFromStorage = (
  raw: string | null,
  sessionId: string,
  tier: PracticeTier
): Record<number, number> => {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);

    // 1. Attempt standard QuizDraftStorageSchema validation
    const standardResult = QuizDraftStorageSchema.safeParse(parsed);
    if (standardResult.success) {
      const data = standardResult.data;
      if (data.sessionId === sessionId && data.tier === tier) {
        if (Array.isArray(data.selectedAnswers)) {
          const result: Record<number, number> = {};
          data.selectedAnswers.forEach((ans, idx) => {
            if (ans !== null && ans !== undefined) {
              result[idx] = ans;
            }
          });
          return result;
        } else if (typeof data.selectedAnswers === 'object' && data.selectedAnswers !== null) {
          const result: Record<number, number> = {};
          Object.entries(data.selectedAnswers).forEach(([k, v]) => {
            const numKey = Number(k);
            if (!Number.isNaN(numKey) && numKey >= 0 && numKey < MCQ_BATCH_SIZE && typeof v === 'number') {
              result[numKey] = v;
            }
          });
          return result;
        }
      }
    }

    // 2. Fallback: direct Record<string, number>
    const recordResult = FallbackDraftRecordSchema.safeParse(parsed);
    if (recordResult.success) {
      const result: Record<number, number> = {};
      Object.entries(recordResult.data).forEach(([k, v]) => {
        const numKey = Number(k);
        if (!Number.isNaN(numKey) && numKey >= 0 && numKey < MCQ_BATCH_SIZE) {
          result[numKey] = v;
        }
      });
      return result;
    }

    // 3. Fallback: direct (number | null)[10] array
    const arrayResult = FallbackDraftArraySchema.safeParse(parsed);
    if (arrayResult.success) {
      const result: Record<number, number> = {};
      arrayResult.data.forEach((ans, idx) => {
        if (ans !== null && ans !== undefined) {
          result[idx] = ans;
        }
      });
      return result;
    }
  } catch {
    // Corrupted or invalid JSON in localStorage is safely ignored
  }

  return {};
};

/**
 * Mid-Quiz Draft Persistence Hook (Edge Case 5, BR-03, architecture.md Section C.2)
 *
 * Saves selected MCQ options immediately to localStorage under mentora_quiz_draft_${sessionId}_${tier}.
 * Hydrates state across page reloads or mode tab toggles, and removes draft upon batch submission.
 */
export const useQuizDraftPersistence = ({
  sessionId,
  tier,
  batchStatus,
}: UseQuizDraftPersistenceOptions): UseQuizDraftPersistenceReturn => {
  const storageKey = sessionId ? getQuizDraftStorageKey(sessionId, tier) : null;

  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>(() => {
    if (!sessionId || !storageKey || batchStatus !== BatchStatus.IN_PROGRESS) {
      return {};
    }
    try {
      const stored = window.localStorage.getItem(storageKey);
      return parseDraftFromStorage(stored, sessionId, tier);
    } catch {
      return {};
    }
  });

  // Re-hydrate or clean up when sessionId, tier, or batchStatus changes
  useEffect(() => {
    if (!sessionId || !storageKey) {
      setSelectedAnswers({});
      return;
    }

    if (batchStatus === BatchStatus.COMPLETED) {
      // Clean up draft on completion
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Storage access error safely ignored
      }
      setSelectedAnswers({});
      return;
    }

    if (batchStatus === BatchStatus.IN_PROGRESS) {
      try {
        const stored = window.localStorage.getItem(storageKey);
        const hydrated = parseDraftFromStorage(stored, sessionId, tier);
        setSelectedAnswers(hydrated);
      } catch {
        setSelectedAnswers({});
      }
      return;
    }

    setSelectedAnswers({});
  }, [sessionId, tier, batchStatus, storageKey]);

  // Select option handler: updates state and writes immediately to localStorage
  const selectOption = useCallback(
    (questionIndex: number, optionIndex: number) => {
      if (
        questionIndex < 0 ||
        questionIndex >= MCQ_BATCH_SIZE ||
        optionIndex < 0 ||
        optionIndex >= MCQ_OPTIONS_COUNT
      ) {
        return;
      }

      setSelectedAnswers((prev) => {
        const next = { ...prev, [questionIndex]: optionIndex };

        if (sessionId && storageKey && batchStatus === BatchStatus.IN_PROGRESS) {
          try {
            const rawArray: (number | null)[] = Array.from(
              { length: MCQ_BATCH_SIZE },
              (_, i) => (next[i] !== undefined ? next[i]! : null)
            );

            const draftPayload = {
              sessionId,
              tier,
              selectedAnswers: rawArray,
              updatedAt: new Date().toISOString(),
            };

            window.localStorage.setItem(storageKey, JSON.stringify(draftPayload));
          } catch {
            // LocalStorage quota or access error handled safely
          }
        }

        return next;
      });
    },
    [sessionId, tier, batchStatus, storageKey]
  );

  // Clear draft handler: resets state and deletes localStorage key
  const clearDraft = useCallback(() => {
    setSelectedAnswers({});
    if (storageKey) {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Storage access error safely ignored
      }
    }
  }, [storageKey]);

  const answersArray = useMemo(() => {
    return Array.from({ length: MCQ_BATCH_SIZE }, (_, i) =>
      selectedAnswers[i] !== undefined ? selectedAnswers[i]! : null
    );
  }, [selectedAnswers]);

  const answeredCount = useMemo(() => {
    return Object.keys(selectedAnswers).filter((k) => {
      const idx = Number(k);
      return idx >= 0 && idx < MCQ_BATCH_SIZE && selectedAnswers[idx] !== undefined;
    }).length;
  }, [selectedAnswers]);

  const isComplete = answeredCount === MCQ_BATCH_SIZE;

  const getAnswersArray = useCallback((): number[] => {
    const result: number[] = [];
    for (let i = 0; i < MCQ_BATCH_SIZE; i++) {
      const ans = selectedAnswers[i];
      if (ans === undefined || ans === null) {
        throw new Error(`Question ${i + 1} has not been answered yet.`);
      }
      result.push(ans);
    }
    return result;
  }, [selectedAnswers]);

  return {
    selectedAnswers,
    answersArray,
    selectOption,
    clearDraft,
    answeredCount,
    isComplete,
    getAnswersArray,
  };
};

