import React from 'react';
import { LearningMode } from '@mentora/shared';
import { useAppDispatch, useAppSelector } from '../../store/hooks.js';
import { setActiveMode, switchSessionModeThunk } from '../../store/sessionSlice.js';

interface ModeTabDefinition {
  mode: LearningMode;
  label: string;
  badge: string;
  description: string;
}

const MODE_TABS: ModeTabDefinition[] = [
  {
    mode: LearningMode.EXPLAIN,
    label: 'Explain',
    badge: '4 Cards',
    description: 'Progressive breakdown & deep dives',
  },
  {
    mode: LearningMode.INTERACT,
    label: 'Interact',
    badge: 'Socratic',
    description: 'Goal-driven milestone dialogue',
  },
  {
    mode: LearningMode.PRACTICE,
    label: 'Practice',
    badge: '10 MCQs',
    description: 'Tiered assessment batches',
  },
];

export const ModeSwitcherTabs: React.FC = () => {
  const dispatch = useAppDispatch();
  const activeMode = useAppSelector((state) => state.session.activeMode);
  const activeSession = useAppSelector((state) => state.session.activeSession);

  const handleSelectMode = (mode: LearningMode) => {
    if (mode === activeMode) return;

    dispatch(setActiveMode(mode));
    if (activeSession) {
      void dispatch(switchSessionModeThunk({ id: activeSession.id, mode }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex: number;
    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % MODE_TABS.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + MODE_TABS.length) % MODE_TABS.length;
    } else {
      return;
    }
    e.preventDefault();
    const nextTab = MODE_TABS[nextIndex];
    if (nextTab) {
      handleSelectMode(nextTab.mode);
    }
  };

  return (
    <nav
      role="tablist"
      aria-label="Learning Mode Switcher"
      className="flex items-center space-x-1 sm:space-x-2 bg-gray-100 p-1 sm:p-1.5 rounded-xl border border-gray-200/80 shadow-inner"
    >
      {MODE_TABS.map((tab, idx) => {
        const isActive = activeMode === tab.mode;
        return (
          <button
            key={tab.mode}
            role="tab"
            aria-selected={isActive}
            aria-controls={`${tab.mode}-stage-panel`}
            id={`tab-${tab.mode}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => handleSelectMode(tab.mode)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              isActive
                ? 'bg-white text-indigo-700 shadow-sm border border-gray-200/60'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`hidden sm:inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-200 text-gray-600'
              }`}
            >
              {tab.badge}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default ModeSwitcherTabs;
