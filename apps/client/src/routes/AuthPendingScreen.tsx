import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks.js';
import { fetchMeThunk } from '../store/authSlice.js';

export interface AuthPendingScreenProps {
  label: string;
}

/** How long the check must run before we assume the free-tier server is cold-starting (L-03). */
const COLD_START_HINT_DELAY_MS = 4000;

/** Error codes where the raw message ("Network Error", a bare 5xx) is not worth showing. */
const UNAVAILABLE_ERROR_CODES = new Set(['NETWORK_ERROR', 'TIMEOUT_ERROR', 'INTERNAL_SERVER_ERROR']);

/**
 * Shown by the route guards while a stored token is being verified. If the check
 * failed for a reason other than an invalid token (network error, 5xx), offers a
 * retry instead of spinning forever or signing the user out (A-22).
 */
export const AuthPendingScreen: React.FC<AuthPendingScreenProps> = ({ label }) => {
  const dispatch = useAppDispatch();
  const { authStatus, error } = useAppSelector((state) => state.auth);
  const checkFailed = authStatus === 'idle' && error !== null;
  const [coldStart, setColdStart] = useState(false);

  useEffect(() => {
    if (checkFailed) {
      setColdStart(false);
      return;
    }
    const timer = setTimeout(() => setColdStart(true), COLD_START_HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [checkFailed, authStatus]);

  if (checkFailed) {
    const friendlyMessage = UNAVAILABLE_ERROR_CODES.has(error.code)
      ? 'Server unavailable — please retry in a moment.'
      : error.message;
    return (
      <div
        role="alert"
        className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-700"
      >
        <div className="flex flex-col items-center space-y-3 text-center px-4">
          <p className="text-sm font-medium">We couldn&apos;t verify your session.</p>
          <p className="text-xs text-gray-500">{friendlyMessage}</p>
          <button
            type="button"
            onClick={() => void dispatch(fetchMeThunk())}
            className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-700"
    >
      <div className="flex flex-col items-center space-y-3">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">
          {coldStart ? 'Waking the server (up to ~30 s)…' : label}
        </p>
      </div>
    </div>
  );
};

export default AuthPendingScreen;
