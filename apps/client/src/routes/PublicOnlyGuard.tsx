import React, { type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from '../store/hooks.js';

export interface PublicOnlyGuardProps {
  children?: ReactNode;
}

export const PublicOnlyGuard: React.FC<PublicOnlyGuardProps> = ({ children }) => {
  const { token, user, authStatus } = useAppSelector((state) => state.auth);

  if (token && user === null && (authStatus === 'idle' || authStatus === 'loading')) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600"
      >
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (token && user) {
    if (user.profile?.isCompleted === false) {
      return <Navigate to="/onboarding" replace />;
    }
    return <Navigate to="/workspace" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default PublicOnlyGuard;
