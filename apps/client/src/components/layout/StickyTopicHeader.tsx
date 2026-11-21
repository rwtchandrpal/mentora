import React, { useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks.js';
import { toggleSidebar, toggleMobileDrawer } from '../../store/uiSlice.js';
import { ModeSwitcherTabs } from './ModeSwitcherTabs.js';
import { SidebarToggleButton } from './SidebarToggleButton.js';

export const StickyTopicHeader: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.auth.user);
  const activeSession = useAppSelector((state) => state.session.activeSession);
  const isSidebarOpen = useAppSelector((state) => state.ui.isSidebarOpen);

  const title = activeSession?.normalizedTitle || activeSession?.topicQuery || 'Mentora Workspace';
  const headerRef = useRef<HTMLElement>(null);

  // Publish the header height so sticky content below it (e.g. the Explain progress bar)
  // can offset itself exactly, across breakpoints and guest/auth header variants.
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--topic-header-height', `${el.offsetHeight}px`);
    publish();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null;
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--topic-header-height');
    };
  }, []);

  return (
    <header ref={headerRef} className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-2.5 sm:px-6 flex items-center justify-between gap-3 shadow-xs">
      <div className="flex items-center space-x-3 min-w-0">
        {/* Mobile drawer toggle */}
        <button
          type="button"
          onClick={() => dispatch(toggleMobileDrawer())}
          className="lg:hidden min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 border-0 outline-none ring-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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

      {/* Mode switcher tabs & Top-Right Get Started CTA for guests */}
      <div className="flex-shrink-0 flex items-center space-x-3">
        <ModeSwitcherTabs />

        {!user && (
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="inline-flex items-center justify-center py-1.5 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Get Started
          </button>
        )}
      </div>
    </header>
  );
};

export default StickyTopicHeader;
