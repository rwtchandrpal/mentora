import React from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks.js';
import { toggleSidebar, toggleMobileDrawer } from '../../store/uiSlice.js';
import { ModeSwitcherTabs } from './ModeSwitcherTabs.js';
import { SidebarToggleButton } from './SidebarToggleButton.js';

export const StickyTopicHeader: React.FC = () => {
  const dispatch = useAppDispatch();
  const activeSession = useAppSelector((state) => state.session.activeSession);
  const isSidebarOpen = useAppSelector((state) => state.ui.isSidebarOpen);

  const title = activeSession?.normalizedTitle || activeSession?.topicQuery || 'Mentora Workspace';

  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-2.5 sm:px-6 flex items-center justify-between gap-3 shadow-xs">
      <div className="flex items-center space-x-3 min-w-0">
        {/* Mobile drawer toggle */}
        <button
          type="button"
          onClick={() => dispatch(toggleMobileDrawer())}
          className="lg:hidden p-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 border-0 outline-none ring-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label="Open sidebar menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Desktop sidebar expand toggle (when sidebar is collapsed) */}
        {!isSidebarOpen && (
          <SidebarToggleButton
            isSidebarOpen={isSidebarOpen}
            onClick={() => dispatch(toggleSidebar())}
            className="hidden lg:flex"
          />
        )}

        {/* Active topic title display */}
        <div className="min-w-0">
          <h1
            className="text-base sm:text-lg font-bold text-gray-900 truncate"
            title={title}
          >
            {title}
          </h1>
        </div>
      </div>

      {/* Mode switcher tabs */}
      <div className="flex-shrink-0">
        <ModeSwitcherTabs />
      </div>
    </header>
  );
};

export default StickyTopicHeader;
