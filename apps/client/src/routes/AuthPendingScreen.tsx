import React from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks.js';
import { fetchMeThunk } from '../store/authSlice.js';

export interface AuthPendingScreenProps {
  label: string;
}

/**
 * Shown by the route guards while a stored token is being verified. If the check
 * failed for a reason other than an invalid token (network error, 5xx), offers a
 * retry instead of spinning forever or signing the user out (A-22).
 */
export const AuthPendingScreen: React.FC<AuthPendingScreenProps> = ({ label }) => {
  const dispatch = useAppDispatch();
  const { authStatus, error } = useAppSelector((state) => state.auth);
  const checkFailed = authStatus === 'idle' && error !== null;

  if (checkFailed) {
    return (
      <div
        role="alert"
        className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-700"
      >
        <div className="flex flex-col items-center space-y-3 text-center px-4">
          <p className="text-sm font-medium">We couldn&apos;t verify your session.</p>
          <p className="text-xs text-gray-500">{error.message}</p>
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
        <p className="text-sm font-medium">{label}</p>
      </div>
    </div>
  );
};

export default AuthPendingScreen;
