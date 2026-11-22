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
    // Below md the header wraps into two rows: menu, title and the guest CTA on top, and the
    // mode tabs full-width underneath. A single row cannot fit all of them on a phone: the
    // tabs used to overflow, cover the menu button, clip the CTA and squash the title to 0px.
    <header
      ref={headerRef}
      data-testid="sticky-topic-header"
      className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-2.5 sm:px-6 flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-2 shadow-xs"
    >
      <div className="flex flex-1 items-center gap-3 min-w-0">
        {/* Mobile drawer toggle */}
        <button
          type="button"
          onClick={() => dispatch(toggleMobileDrawer())}
          className="lg:hidden shrink-0 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 border-0 outline-none ring-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
        <div className="min-w-0 flex-1">
          <h1
            className="text-base sm:text-lg font-bold text-gray-900 truncate"
            title={title}
          >
            {title}
          </h1>
        </div>
      </div>

      {/* Top-right Get Started CTA for guests: first row on mobile, after the tabs from md up */}
      {!user && (
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="shrink-0 md:order-last inline-flex items-center justify-center min-h-[44px] md:min-h-0 py-1.5 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Get Started
        </button>
      )}

      {/* Mode switcher tabs: own full-width row on mobile, inline from md up */}
      <div className="order-last w-full md:order-none md:w-auto md:shrink-0">
        <ModeSwitcherTabs />
      </div>
    </header>
  );
};

export default StickyTopicHeader;
