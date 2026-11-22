import React from 'react';
import {
  useServerReadiness,
  type ServerReadinessOptions,
} from '../../hooks/useServerReadiness.js';

export interface ServerWakeupGateProps {
  children: React.ReactNode;
  /** Timing overrides (tests). */
  options?: ServerReadinessOptions;
}

const Dots: React.FC = () => (
  <div
    className="flex items-center justify-center gap-2"
    aria-hidden="true"
    data-testid="wake-dots"
  >
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="h-2.5 w-2.5 rounded-full bg-indigo-600 animate-pulse motion-reduce:animate-none"
        style={{ animationDelay: `${i * 200}ms`, animationDuration: '1.2s' }}
      />
    ))}
  </div>
);

/**
 * Holds the app back until `/health` reports the backend is ready, so a cold Render instance
 * never meets workspace/session requests that would fail. A warm server answers inside the
 * grace window and the card is never shown.
 */
export const ServerWakeupGate: React.FC<ServerWakeupGateProps> = ({ children, options }) => {
  const { status, isSlow, retry } = useServerReadiness(options);

  if (status === 'ready') {
    return <>{children}</>;
  }

  if (status === 'checking') {
    return <div className="min-h-screen bg-gray-50" data-testid="wake-gate-checking" />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        data-testid="wake-card"
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm"
      >
        {status === 'timeout' ? (
          <>
            <h1 className="text-lg font-semibold text-gray-900">
              The server is taking longer than expected
            </h1>
            <p className="mt-2 text-sm text-gray-700">
              Mentora&apos;s server didn&apos;t respond in time. Please try again.
            </p>
            <button
              type="button"
              onClick={retry}
              className="mt-6 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Try Again
            </button>
          </>
        ) : (
          <>
            <Dots />
            <h1 className="mt-6 text-lg font-semibold text-gray-900">
              Creating a learning session for you
            </h1>
            <p className="mt-2 min-h-[1.25rem] text-sm text-gray-700">
              {isSlow ? 'Warming up the workspace—this only takes a moment' : ''}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default ServerWakeupGate;
