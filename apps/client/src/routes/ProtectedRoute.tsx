import React, { type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from '../store/hooks.js';
import { AuthPendingScreen } from './AuthPendingScreen.js';

export interface ProtectedRouteProps {
  children?: ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { token, user, authStatus } = useAppSelector((state) => state.auth);

  if (token && user === null && (authStatus === 'idle' || authStatus === 'loading')) {
    return <AuthPendingScreen label="Authenticating session..." />;
  }

  if (!token || authStatus === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;
