import React from 'react';
import { LearningMode } from '@mentora/shared';

export interface CardControlsProps {
  stepNumber: number;
  isLatestVisibleCard: boolean;
  canAdvanceNext: boolean;
  onNext: () => void;
  onSwitchMode?: (mode: LearningMode) => void;
}

export const CardControls: React.FC<CardControlsProps> = ({
  stepNumber,
  isLatestVisibleCard,
  canAdvanceNext,
  onNext,
  onSwitchMode,
}) => {
  const isFinalStep = stepNumber === 4;
  const showNext = isLatestVisibleCard && canAdvanceNext;

  if (!showNext && !isFinalStep) {
    return null;
  }

  return (
    <div className="pt-4 border-t border-gray-100 flex flex-col space-y-4">
      {/* Next Step Button (Shown on latest visible card when stepNumber < 4) */}
      {showNext && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onNext}
            aria-label={`Advance to Step ${stepNumber + 1}`}
            className="inline-flex items-center px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <span>Next</span>
            <svg
              data-testid="next-arrow-down"
              className="w-4 h-4 ml-1.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Step 4 Completion CTAs & Mode Transitions */}
      {isFinalStep && (
        <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-emerald-50 rounded-2xl p-4 sm:p-5 border border-indigo-100 space-y-3">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-gray-900">
              4-Step Explanation Complete
            </h4>
            <p className="text-xs text-gray-700 font-medium">
              Discuss it or test yourself next:
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            {/* Discuss in Interact Mode */}
            <button
              type="button"
              onClick={() => onSwitchMode?.(LearningMode.INTERACT)}
              className="inline-flex items-center px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <span>Discuss in Interact Mode</span>
            </button>

            {/* Test Yourself in Practice Mode */}
            <button
              type="button"
              onClick={() => onSwitchMode?.(LearningMode.PRACTICE)}
              className="inline-flex items-center px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>Test Yourself in Practice Mode</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
