import React from 'react';
import { useAppSelector } from '../../store/hooks.js';

/**
 * Shown while the API is unreachable and the client is waiting for it to come back
 * (LIVE-BUG-H4). The free Render instance can take a minute or two to restart, and
 * requests made meanwhile are retried automatically once it answers.
 */
export const ServerStatusBanner: React.FC = () => {
  const isServerWaking = useAppSelector((state) => state.ui.isServerWaking);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      {isServerWaking && (
        <div
          data-testid="server-waking-banner"
          className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 shadow-md"
        >
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"
          />
          <span>Mentora&apos;s server is waking up. Retrying automatically…</span>
        </div>
      )}
    </div>
  );
};

export default ServerStatusBanner;
