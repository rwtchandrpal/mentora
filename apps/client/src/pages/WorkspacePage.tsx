import React from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks.js';
import { logout } from '../store/authSlice.js';
import { openProfileModal } from '../store/uiSlice.js';
import { ProfileSettingsModal } from '../components/layout/ProfileSettingsModal.js';

export const WorkspacePage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow">
            M
          </div>
          <span className="text-lg font-bold text-gray-900 tracking-tight">Mentora</span>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => dispatch(openProfileModal())}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            Profile Settings
          </button>
          <button
            type="button"
            onClick={() => dispatch(logout())}
            className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-lg text-xs sm:text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Main Workspace Stage */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 sm:p-8 flex flex-col justify-center items-center text-center">
        <div className="max-w-xl w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-200 space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-indigo-100 text-indigo-700 font-bold text-2xl flex items-center justify-center shadow-inner">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>

          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">
              Welcome to Mentora, {user?.name || 'Learner'}!
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Your personalized learning environment is active and ready.
            </p>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl text-left border border-gray-100 space-y-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Active Learner Profile (Calibrated)
            </h2>
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <span className="text-xs text-gray-500 block">Education Level:</span>
                <span className="text-sm font-medium text-gray-900 capitalize">
                  {user?.profile?.educationLevel?.replace('_', ' ') || 'Not Set'}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Explanation Style:</span>
                <span className="text-sm font-medium text-gray-900 capitalize">
                  {user?.profile?.preferredStyle?.replace('_', ' ') || 'Not Set'}
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Workspace Shell (`LeftHistorySidebar`, `StickyTopicHeader`, `ModeSwitcherTabs`) will be initialized in `IMP-012`.
          </p>
        </div>
      </main>

      {/* Profile Settings Modal */}
      <ProfileSettingsModal />
    </div>
  );
};

export default WorkspacePage;
