import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LearningMode, type SessionSummaryDTO } from '@mentora/shared';
import { useAppDispatch, useAppSelector } from '../../store/hooks.js';
import {
  clearActiveSession,
  fetchSessionByIdThunk,
  deleteSessionThunk,
} from '../../store/sessionSlice.js';
import {
  setMobileDrawerOpen,
  openProfileModal,
  toggleSidebar,
} from '../../store/uiSlice.js';
import { logout } from '../../store/authSlice.js';
import { QuotaBadge } from './QuotaBadge.js';
import { SidebarToggleButton } from './SidebarToggleButton.js';
import { getModeBadgeClasses } from '../../utils/modeTheme.js';

export const LeftHistorySidebar: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const user = useAppSelector((state) => state.auth.user);
  const sessionList = useAppSelector((state) => state.session.sessionList);
  const activeSession = useAppSelector((state) => state.session.activeSession);
  const isLoadingList = useAppSelector((state) => state.session.isLoadingList);
  const isSidebarOpen = useAppSelector((state) => state.ui.isSidebarOpen);
  const isMobileDrawerOpen = useAppSelector((state) => state.ui.isMobileDrawerOpen);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const safeSessionList = Array.isArray(sessionList) ? sessionList : [];
  const sortedSessions = [...safeSessionList].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const handleNewTopic = () => {
    dispatch(clearActiveSession());
    navigate('/workspace');
    dispatch(setMobileDrawerOpen(false));
  };

  const handleSelectSession = (sessionId: string) => {
    if (activeSession?.id === sessionId || activeSession?._id === sessionId) {
      dispatch(setMobileDrawerOpen(false));
      return;
    }
    void dispatch(fetchSessionByIdThunk(sessionId));
    navigate(`/workspace/${sessionId}`);
    dispatch(setMobileDrawerOpen(false));
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await dispatch(deleteSessionThunk(sessionId));
      if (activeSession?.id === sessionId || activeSession?._id === sessionId) {
        dispatch(clearActiveSession());
        navigate('/workspace');
      }
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const getModeBadgeColor = (mode: LearningMode) => {
    return getModeBadgeClasses(mode);
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Brand & New Topic Section */}
      <div className="p-4 border-b border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-md">
              M
            </div>
            <span className="font-bold text-gray-900 tracking-tight text-lg">Mentora</span>
          </div>

          <div className="flex items-center space-x-1">
            {/* Desktop sidebar collapse toggle (top-right of sidebar when open) */}
            {isSidebarOpen && (
              <SidebarToggleButton
                isSidebarOpen={isSidebarOpen}
                onClick={() => dispatch(toggleSidebar())}
                className="hidden lg:flex"
              />
            )}

            {/* Close button for mobile drawer */}
            <button
              type="button"
              onClick={() => dispatch(setMobileDrawerOpen(false))}
              className="lg:hidden p-1 text-gray-600 hover:text-gray-900 rounded-lg border-0 outline-none ring-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label="Close sidebar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* "+ New Topic" Action Button */}
        <button
          type="button"
          onClick={handleNewTopic}
          className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>New Topic</span>
        </button>
      </div>

      {/* Scrollable Session List */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        <div className="px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-gray-600">
          Recent Topics ({sortedSessions.length})
        </div>

        {isLoadingList && sortedSessions.length === 0 && (
          <div className="space-y-2 p-2">
            <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        )}

        {!isLoadingList && sortedSessions.length === 0 && (
          <div className="p-4 text-center text-xs text-gray-600 font-medium leading-relaxed">
            No saved topics yet.
          </div>
        )}

        {sortedSessions.map((session: SessionSummaryDTO) => {
          const isActive =
            activeSession?.id === session.id || activeSession?._id === session.id;
          const isConfirming = confirmDeleteId === session.id;

          return (
            <div
              key={session.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSelectSession(session.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectSession(session.id);
                }
              }}
              className={`group relative p-2.5 rounded-xl text-left cursor-pointer transition-all border ${
                isActive
                  ? 'bg-indigo-50/70 border-indigo-200 shadow-xs'
                  : 'bg-white hover:bg-gray-50 border-transparent hover:border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs font-semibold truncate ${
                      isActive ? 'text-indigo-950 font-bold' : 'text-gray-800'
                    }`}
                    title={session.normalizedTitle || session.topicQuery}
                  >
                    {session.normalizedTitle || session.topicQuery}
                  </p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span
                      className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-medium ${getModeBadgeColor(
                        session.lastActiveMode
                      )}`}
                    >
                      {session.lastActiveMode}
                    </span>
                    <span className="text-[10px] font-medium text-gray-600">
                      {new Date(session.updatedAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                {/* Session delete action */}
                <div className="flex items-center">
                  {isConfirming ? (
                    <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        className="p-1 text-[10px] font-semibold bg-red-600 text-white rounded hover:bg-red-700"
                        title="Confirm deletion"
                        aria-label={`Confirm delete ${session.normalizedTitle}`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(null);
                        }}
                        className="p-1 text-[10px] font-semibold bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        title="Cancel deletion"
                        aria-label="Cancel deletion"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(session.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-600 hover:text-red-700 hover:bg-red-50 rounded transition-all focus:opacity-100"
                      title="Delete session"
                      aria-label={`Delete session ${session.normalizedTitle}`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quota Badge & User Profile Footer */}
      <div className="p-3 border-t border-gray-100 bg-gray-50/50 space-y-3">
        <QuotaBadge />

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-900 truncate" title={user?.name}>
                {user?.name || 'Learner'}
              </p>
              <button
                type="button"
                onClick={() => dispatch(openProfileModal())}
                className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 hover:underline block truncate text-left"
              >
                Profile Settings
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => dispatch(logout())}
            className="p-1.5 text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop static / collapsible sidebar */}
      <aside
        className={`hidden lg:block h-screen transition-all duration-200 z-10 flex-shrink-0 ${
          isSidebarOpen ? 'w-72' : 'w-0 overflow-hidden'
        }`}
      >
        <div className="w-72 h-full">{renderSidebarContent()}</div>
      </aside>

      {/* Mobile slide-out drawer backdrop and panel */}
      {isMobileDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation History Drawer"
          className="lg:hidden fixed inset-0 z-50 overflow-hidden"
        >
          <div
            className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => dispatch(setMobileDrawerOpen(false))}
          />
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            {renderSidebarContent()}
          </div>
        </div>
      )}
    </>
  );
};

export default LeftHistorySidebar;
