import React, { useEffect, useCallback, useRef } from 'react';
import {
  LearningMode,
  ExplainStatus,
} from '@mentora/shared';
import { useAppDispatch, useAppSelector } from '../../store/hooks.js';
import {
  initializeExplainThunk,
  advanceExplainStepThunk,
  switchSessionModeThunk,
  clearExplainError,
} from '../../store/sessionSlice.js';
import { StepProgressBar } from './StepProgressBar.js';
import { ExplainCard } from './ExplainCard.js';

export const ExplainStage: React.FC = () => {
  const dispatch = useAppDispatch();

  const activeSession = useAppSelector((state) => state.session.activeSession);
  const isInitializingExplain = useAppSelector(
    (state) => state.session.isInitializingExplain
  );
  const explainError = useAppSelector((state) => state.session.explainError);

  const sessionId = activeSession?.id ?? activeSession?._id;
  const explainState = activeSession?.explainState;
  const hasAttemptedInitRef = useRef<string | null>(null);

  // Auto-Initialization: if explainState.status === 'not_started', dispatch initializeExplainThunk
  useEffect(() => {
    if (
      sessionId &&
      explainState?.status === ExplainStatus.NOT_STARTED &&
      !isInitializingExplain &&
      !explainError &&
      hasAttemptedInitRef.current !== sessionId
    ) {
      hasAttemptedInitRef.current = sessionId;
      void dispatch(initializeExplainThunk(sessionId));
    }
  }, [sessionId, explainState?.status, isInitializingExplain, explainError, dispatch]);

  const handleSelectStep = useCallback((stepIndex: number) => {
    const cardEl = document.getElementById(`explain-card-${stepIndex + 1}`);
    if (cardEl && typeof cardEl.scrollIntoView === 'function') {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const handleNext = useCallback(
    async (currentStepNumber: number) => {
      if (!sessionId || !explainState) return;
      const nextStepIndex = currentStepNumber; // stepNumber is 1-based, so nextStepIndex is equal to stepNumber
      if (nextStepIndex <= 3) {
        const result = await dispatch(
          advanceExplainStepThunk({
            sessionId,
            stepIndex: nextStepIndex,
          })
        );
        if (advanceExplainStepThunk.fulfilled.match(result)) {
          // Wait for the new card to commit, then bring it under the sticky progress bar.
          requestAnimationFrame(() => handleSelectStep(nextStepIndex));
        }
      }
    },
    [sessionId, explainState, dispatch, handleSelectStep]
  );

  const handleSwitchMode = useCallback(
    (mode: LearningMode) => {
      if (!sessionId) return;
      void dispatch(switchSessionModeThunk({ id: sessionId, mode }));
    },
    [sessionId, dispatch]
  );

  if (!activeSession || !explainState) {
    return null;
  }

  // 1. Initial Loading Skeleton State (NFR-002)
  const isInitialLoading =
    explainState.status === ExplainStatus.NOT_STARTED ||
    (isInitializingExplain && explainState.cards.length === 0);

  if (isInitialLoading && !explainError) {
    return (
      <div
        role="tabpanel"
        id="explain-stage-panel"
        aria-labelledby="tab-explain"
        data-testid="explain-stage-loading"
        className="w-full flex-1 flex flex-col space-y-6 animate-pulse"
      >
        {/* Stepper Skeleton */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs flex items-center justify-between">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex-1 flex flex-col items-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-gray-200" />
              <div className="w-16 h-3 rounded bg-gray-200" />
            </div>
          ))}
        </div>

        {/* Informative Progress Banner */}
        <div
          role="status"
          aria-live="polite"
          className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-6 text-center space-y-3"
        >
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 text-white shadow-md">
            <svg
              className="animate-spin w-6 h-6"
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
          </div>
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-gray-900">
              Loading explanation...
            </h3>
          </div>
        </div>

        {/* Card Skeleton */}
        <div className="bg-white rounded-2xl border border-gray-200 p-8 space-y-4 shadow-xs">
          <div className="w-28 h-6 bg-gray-200 rounded-full" />
          <div className="w-2/3 h-8 bg-gray-200 rounded-lg" />
          <div className="space-y-2 pt-2">
            <div className="w-full h-4 bg-gray-200 rounded" />
            <div className="w-5/6 h-4 bg-gray-200 rounded" />
            <div className="w-4/6 h-4 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  // 2. Educational Guardrail Refusal or Critical Error State (Edge Case 1 & 2)
  const isEducationalRefusal =
    explainError?.code === 'EDUCATIONAL_GUARDRAIL_REFUSAL';

  return (
    <div
      role="tabpanel"
      id="explain-stage-panel"
      aria-labelledby="tab-explain"
      data-testid="explain-stage"
      className="w-full flex-1 flex flex-col space-y-6"
    >
      {/* Error / Refusal Banner */}
      {explainError && (
        <div
          role="alert"
          className={`p-5 rounded-2xl border space-y-3 ${
            isEducationalRefusal
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 mt-0.5">
              {isEducationalRefusal ? (
                <svg
                  className="w-5 h-5 text-amber-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5 text-red-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="text-sm font-bold">
                {isEducationalRefusal
                  ? 'Educational Scope Guardrail Notice'
                  : 'Unable to Complete Explain Mode Action'}
              </h4>
              <p className="text-xs sm:text-sm leading-relaxed opacity-90">
                {explainError.message ||
                  'Mentora is dedicated exclusively to academic and educational concepts. Please rephrase or try another educational topic.'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 pt-1">
            {sessionId && (
              <button
                type="button"
                onClick={() => {
                  hasAttemptedInitRef.current = null;
                  dispatch(clearExplainError());
                  void dispatch(initializeExplainThunk(sessionId));
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={() => dispatch(clearExplainError())}
              className="text-xs font-medium underline opacity-80 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 3. Visual 4-Step Progress Bar (sticks just below StickyTopicHeader) */}
      <div
        data-testid="explain-progress-sticky"
        className="sticky top-[var(--topic-header-height,4.25rem)] z-10 -mx-1 px-1 py-2 bg-gray-50/90 backdrop-blur-sm"
      >
        <StepProgressBar
          currentStepIndex={explainState.currentStepIndex}
          onSelectRevealedStep={handleSelectStep}
        />
      </div>

      {/* 4. Progressive Cards List (AC-EXP-01, AC-EXP-02) */}
      {/* Slices explainState.cards so ONLY cards up to currentStepIndex are rendered in DOM */}
      <div className="space-y-6">
        {explainState.cards
          .slice(0, explainState.currentStepIndex + 1)
          .map((card, index, visibleSlice) => {
            const isLatestVisible = index === visibleSlice.length - 1;
            return (
              <ExplainCard
                key={`${sessionId}-${card.stepNumber}`}
                card={card}
                isLatestVisibleCard={isLatestVisible}
                onNext={() => handleNext(card.stepNumber)}
                onSwitchMode={handleSwitchMode}
              />
            );
          })}
      </div>
    </div>
  );
};

export default ExplainStage;
