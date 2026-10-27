import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks.js';
import { fetchMeThunk } from '../store/authSlice.js';
import { ProtectedRoute } from './ProtectedRoute.js';
import { OnboardingGuard } from './OnboardingGuard.js';
import { PublicOnlyGuard } from './PublicOnlyGuard.js';
import { LoginPage } from '../pages/LoginPage.js';
import { RegisterPage } from '../pages/RegisterPage.js';
import { OnboardingPage } from '../pages/OnboardingPage.js';
import { WorkspacePage } from '../pages/WorkspacePage.js';

export const AppRouter: React.FC = () => {
  const dispatch = useAppDispatch();
  const { token, user, authStatus } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (token && user === null && authStatus === 'idle') {
      void dispatch(fetchMeThunk());
    }
  }, [dispatch, token, user, authStatus]);

  return (
    <Routes>
      {/* Public Only routes */}
      <Route element={<PublicOnlyGuard />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route
          path="/onboarding"
          element={
            user?.profile?.isCompleted === true ? (
              <Navigate to="/workspace" replace />
            ) : (
              <OnboardingPage />
            )
          }
        />
        <Route element={<OnboardingGuard />}>
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/workspace/:sessionId" element={<WorkspacePage />} />
        </Route>
      </Route>

      {/* Fallback routes */}
      <Route path="/" element={<Navigate to="/workspace" replace />} />
      <Route path="*" element={<Navigate to="/workspace" replace />} />
    </Routes>
  );
};

export default AppRouter;
