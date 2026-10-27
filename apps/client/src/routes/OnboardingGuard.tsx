import React, { type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from '../store/hooks.js';

export interface OnboardingGuardProps {
  children?: ReactNode;
}

export const OnboardingGuard: React.FC<OnboardingGuardProps> = ({ children }) => {
  const { user } = useAppSelector((state) => state.auth);

  if (user && user.profile?.isCompleted === false) {
    return <Navigate to="/onboarding" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default OnboardingGuard;
