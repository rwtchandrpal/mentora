import React, { useEffect, useState } from 'react';
import { pingHealthCheck } from '../../services/apiClient.js';
import { useAppSelector } from '../../store/hooks.js';
import {
  WAKE_SPLASH_SHOW_AFTER_MS,
  WAKE_SPLASH_POLL_INTERVAL_MS,
  WAKE_SPLASH_GIVE_UP_AFTER_MS,
  WAKE_SPLASH_EXPECTED_MS,
} from '../../config/timeouts.js';

export interface ServerWakeSplashProps {
  showAfterMs?: number;
  pollIntervalMs?: number;
  giveUpAfterMs?: number;
  expectedMs?: number;
}

/**
 * Probes `/health` on first load. A warm API answers instantly and nothing is shown. When it
 * doesn't answer within `showAfterMs` (a cold Render instance), a friendly banner with a
 * progress bar and elapsed time replaces the silent spinner, and disappears as soon as the
 * API responds. Probing stops after `giveUpAfterMs`; the request-level wake handling in
 * apiClient still covers later failures.
 */
export const ServerWakeSplash: React.FC<ServerWakeSplashProps> = ({
  showAfterMs = WAKE_SPLASH_SHOW_AFTER_MS,
  pollIntervalMs = WAKE_SPLASH_POLL_INTERVAL_MS,
  giveUpAfterMs = WAKE_SPLASH_GIVE_UP_AFTER_MS,
  expectedMs = WAKE_SPLASH_EXPECTED_MS,
}) => {
  const [visible, setVisible] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  // The request-level banner already explains a wait in progress; don't stack two.
  const isRequestBannerShown = useAppSelector((state) => state.ui.isServerWaking);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    const showTimer = setTimeout(() => {
      if (!cancelled) setVisible(true);
    }, showAfterMs);
    const tick = setInterval(() => {
      if (!cancelled) setElapsedMs(Date.now() - startedAt);
    }, 1000);

    const finish = () => {
      cancelled = true;
      clearTimeout(showTimer);
      clearTimeout(pollTimer);
      clearInterval(tick);
      setVisible(false);
    };

    const probe = async (): Promise<void> => {
      const ok = await pingHealthCheck();
      if (cancelled) return;
      if (ok || Date.now() - startedAt >= giveUpAfterMs) {
        finish();
        return;
      }
      pollTimer = setTimeout(() => void probe(), pollIntervalMs);
    };
    void probe();

    return () => {
      cancelled = true;
      clearTimeout(showTimer);
      clearTimeout(pollTimer);
      clearInterval(tick);
    };
  }, [showAfterMs, pollIntervalMs, giveUpAfterMs]);

  if (!visible || isRequestBannerShown) {
    return null;
  }

  const seconds = Math.floor(elapsedMs / 1000);
  // Eases toward 95% so the bar keeps moving without ever claiming to be done.
  const percent = Math.round(95 * (1 - Math.exp(-elapsedMs / expectedMs)));
  const isSlow = elapsedMs > expectedMs;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        data-testid="server-wake-splash"
        className="pointer-events-auto w-full max-w-md space-y-2 rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-lg"
      >
        <div className="flex items-center gap-2.5 font-semibold">
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"
          />
          <span>Waking up Mentora&apos;s server…</span>
        </div>
        <p className="text-xs font-medium text-gray-700">
          {isSlow
            ? 'Taking a little longer than usual. Hang tight, this page will be ready as soon as it responds.'
            : 'The free server sleeps when idle, so the first visit can take up to a minute. After that, it is fast.'}
        </p>
        <div
          role="progressbar"
          aria-label="Server start-up progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
        >
          <div
            data-testid="server-wake-progress"
            className="h-full rounded-full bg-indigo-600 transition-all duration-1000"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-right text-[11px] font-medium text-gray-600">{seconds}s elapsed</p>
      </div>
    </div>
  );
};

export default ServerWakeSplash;
