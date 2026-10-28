import React from 'react';
import { LearningMode, MAX_DEEP_DIVE_DEPTH } from '@mentora/shared';

export interface CardControlsProps {
  stepNumber: number;
  isLatestVisibleCard: boolean;
  canAdvanceNext: boolean;
  canGoDeeper: boolean;
  isGoingDeeper: boolean;
  onNext: () => void;
  onGoDeeper: () => void;
  suggestedSubTopics?: string[];
  onSelectSubTopic?: (subTopic: string) => void;
  onSwitchMode?: (mode: LearningMode) => void;
}

export const CardControls: React.FC<CardControlsProps> = ({
  stepNumber,
  isLatestVisibleCard,
  canAdvanceNext,
  canGoDeeper,
  isGoingDeeper,
  onNext,
  onGoDeeper,
  suggestedSubTopics,
  onSelectSubTopic,
  onSwitchMode,
}) => {
  const isFinalStep = stepNumber === 4;

  return (
    <div className="pt-4 border-t border-gray-100 flex flex-col space-y-4">
      {/* Primary Actions Row (Next + Go Deeper) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Go Deeper Button */}
        <div>
          <button
            type="button"
            disabled={!canGoDeeper || isGoingDeeper}
            onClick={onGoDeeper}
            aria-label={
              isGoingDeeper
                ? 'Generating deeper breakdown...'
                : !canGoDeeper
                ? `Max depth reached (${MAX_DEEP_DIVE_DEPTH} deep dives)`
                : 'Go deeper into this step'
            }
            className={`inline-flex items-center px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-xs ${
              isGoingDeeper
                ? 'bg-indigo-100 text-indigo-700 cursor-wait'
                : canGoDeeper
                ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
            }`}
          >
            {isGoingDeeper ? (
              <>
                <svg
                  className="animate-spin -ml-0.5 mr-2 h-4 w-4 text-indigo-700"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Generating deeper breakdown...</span>
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4 mr-1.5 text-indigo-600"
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
                <span>{canGoDeeper ? 'Go Deeper' : 'Max Depth Reached'}</span>
              </>
            )}
          </button>
        </div>

        {/* Next Step Button (Shown on latest visible card when stepNumber < 4) */}
        {isLatestVisibleCard && canAdvanceNext && (
          <div className="ml-auto">
            <button
              type="button"
              onClick={onNext}
              aria-label={`Advance to Step ${stepNumber + 1}`}
              className="inline-flex items-center px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <span>Next</span>
              <svg
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
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Step 4 Completion CTAs & Mode Transitions */}
      {isFinalStep && (
        <div className="pt-4 mt-2 border-t border-gray-100 space-y-4">
          <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-emerald-50 rounded-2xl p-4 sm:p-5 border border-indigo-100 space-y-3">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-gray-900">
                You have completed the foundational 4-step explanation!
              </h4>
              <p className="text-xs text-gray-600">
                Deepen your mastery with conversational inquiry or test your retrieval through tiered MCQ assessment:
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

          {/* Broad-Topic Suggested Sub-Topics Chips (Edge Case 2) */}
          {suggestedSubTopics && suggestedSubTopics.length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="block text-xs font-semibold text-gray-700">
                Explore Focused Sub-Topics:
              </span>
              <div className="flex flex-wrap gap-2">
                {suggestedSubTopics.map((subTopic) => (
                  <button
                    key={subTopic}
                    type="button"
                    onClick={() => onSelectSubTopic?.(subTopic)}
                    className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500"
                  >
                    <span>{subTopic}</span>
                    <svg
                      className="w-3 h-3 ml-1 text-indigo-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                      />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

