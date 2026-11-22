import { useCallback, useEffect, useRef, useState } from 'react';
import { checkServerHealth } from '../services/apiClient.js';
import {
  WAKE_GATE_GRACE_MS,
  WAKE_GATE_POLL_INTERVAL_MS,
  WAKE_GATE_REQUEST_TIMEOUT_MS,
  WAKE_GATE_MAX_WAIT_MS,
  WAKE_GATE_SLOW_HINT_MS,
} from '../config/timeouts.js';

export type ServerReadinessStatus = 'checking' | 'waking' | 'ready' | 'timeout';

export interface ServerReadinessOptions {
  graceMs?: number;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
  maxWaitMs?: number;
  slowHintMs?: number;
}

export interface ServerReadiness {
  status: ServerReadinessStatus;
  /** True once the wake-up has taken longer than `slowHintMs`. */
  isSlow: boolean;
  retry: () => void;
}

// Readiness is remembered for the lifetime of the page, so in-app navigation (and remounts)
// never re-trigger the gate.
let serverKnownReady = false;

/** Forgets the cached readiness (tests only). */
export const resetServerReadinessCache = (): void => {
  serverKnownReady = false;
};

/**
 * Cold-start readiness state machine: `checking` for a short grace window (a warm server
 * answers inside it, so nothing is shown), then `waking` while `/health` is polled, `ready`
 * on the first HTTP 200, or `timeout` once `maxWaitMs` passes without one. `retry()`
 * restarts the loop after a timeout.
 */
export const useServerReadiness = (options: ServerReadinessOptions = {}): ServerReadiness => {
  const {
    graceMs = WAKE_GATE_GRACE_MS,
    pollIntervalMs = WAKE_GATE_POLL_INTERVAL_MS,
    requestTimeoutMs = WAKE_GATE_REQUEST_TIMEOUT_MS,
    maxWaitMs = WAKE_GATE_MAX_WAIT_MS,
    slowHintMs = WAKE_GATE_SLOW_HINT_MS,
  } = options;

  const [status, setStatus] = useState<ServerReadinessStatus>(
    serverKnownReady ? 'ready' : 'checking'
  );
  const [isSlow, setIsSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const isFirstRunRef = useRef(true);

  useEffect(() => {
    if (serverKnownReady) {
      setStatus('ready');
      return;
    }

    const controller = new AbortController();
    const startedAt = Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    // A retry goes straight back to the card; the first run waits out the grace window.
    if (isFirstRunRef.current) {
      setStatus('checking');
      timers.push(
        setTimeout(() => {
          if (!cancelled) setStatus((s) => (s === 'checking' ? 'waking' : s));
        }, graceMs)
      );
    } else {
      setStatus('waking');
    }
    isFirstRunRef.current = false;
    setIsSlow(false);
    timers.push(
      setTimeout(() => {
        if (!cancelled) setIsSlow(true);
      }, slowHintMs)
    );

    const poll = async (): Promise<void> => {
      const ok = await checkServerHealth(controller.signal, requestTimeoutMs);
      if (cancelled) return;
      if (ok) {
        serverKnownReady = true;
        setStatus('ready');
        return;
      }
      // Failed fast (503 / network error): the server is cold, so show the card now.
      setStatus((s) => (s === 'checking' ? 'waking' : s));
      if (Date.now() - startedAt + pollIntervalMs >= maxWaitMs) {
        setStatus('timeout');
        return;
      }
      timers.push(setTimeout(() => void poll(), pollIntervalMs));
    };
    void poll();

    return () => {
      cancelled = true;
      controller.abort();
      timers.forEach(clearTimeout);
    };
  }, [attempt, graceMs, pollIntervalMs, requestTimeoutMs, maxWaitMs, slowHintMs]);

  return { status, isSlow, retry };
};
