import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks.js';
import { fetchMeThunk } from '../store/authSlice.js';
import { ProtectedRoute } from './ProtectedRoute.js';
import { OnboardingGuard } from './OnboardingGuard.js';
import { PublicOnlyGuard } from './PublicOnlyGuard.js';
import { LoginPage } from '../pages/LoginPage.js';
import { RegisterPage } from '../pages/RegisterPage.js';
import { OnboardingPage } from '../pages/OnboardingPage.js';

// The workspace pulls in the markdown/KaTeX/Mermaid/code-highlighting stack, so it is
// split out of the entry chunk and loaded when a workspace route is first visited (A-16).
const WorkspacePage = lazy(() => import('../pages/WorkspacePage.js'));

const WorkspaceLoading: React.FC = () => (
  <div
    role="status"
    className="min-h-screen flex items-center justify-center bg-gray-50 text-sm text-gray-500"
  >
    Loading workspace...
  </div>
);

export const AppRouter: React.FC = () => {
  const dispatch = useAppDispatch();
  const { token, user, authStatus, error } = useAppSelector((state) => state.auth);

  useEffect(() => {
    // After a failed check (error set) wait for the user to press Retry rather than
    // re-requesting in a loop.
    if (token && user === null && authStatus === 'idle' && error === null) {
      void dispatch(fetchMeThunk());
    }
  }, [dispatch, token, user, authStatus, error]);

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
      </Route>

      {/* Workspace routes: Accessible to guests and authenticated users */}
      <Route element={<OnboardingGuard />}>
        <Route
          path="/workspace"
          element={
            <Suspense fallback={<WorkspaceLoading />}>
              <WorkspacePage />
            </Suspense>
          }
        />
        <Route
          path="/workspace/:sessionId"
          element={
            <Suspense fallback={<WorkspaceLoading />}>
              <WorkspacePage />
            </Suspense>
          }
        />
      </Route>

      {/* Fallback routes */}
      <Route path="/" element={<Navigate to="/workspace" replace />} />
      <Route path="*" element={<Navigate to="/workspace" replace />} />
    </Routes>
  );
};

export default AppRouter;
