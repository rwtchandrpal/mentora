import React, { type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from '../store/hooks.js';
import { AuthPendingScreen } from './AuthPendingScreen.js';

export interface PublicOnlyGuardProps {
  children?: ReactNode;
}

export const PublicOnlyGuard: React.FC<PublicOnlyGuardProps> = ({ children }) => {
  const { token, user, authStatus } = useAppSelector((state) => state.auth);

  if (token && user === null && (authStatus === 'idle' || authStatus === 'loading')) {
    return <AuthPendingScreen label="Verifying session..." />;
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
