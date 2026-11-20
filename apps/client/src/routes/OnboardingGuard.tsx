import React, { type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from '../store/hooks.js';
import { AuthPendingScreen } from './AuthPendingScreen.js';

export interface OnboardingGuardProps {
  children?: ReactNode;
}

export const OnboardingGuard: React.FC<OnboardingGuardProps> = ({ children }) => {
  const { token, user, authStatus } = useAppSelector((state) => state.auth);

  if (token && user === null && (authStatus === 'idle' || authStatus === 'loading')) {
    return <AuthPendingScreen label="Authenticating session..." />;
  }

  if (user && user.profile?.isCompleted === false) {
    return <Navigate to="/onboarding" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default OnboardingGuard;
