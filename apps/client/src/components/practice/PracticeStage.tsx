import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  PracticeTier,
  BatchStatus,
  ErrorCode,
  type McqQuestionMaskedDTO,
  type McqQuestionFullDTO,
} from '@mentora/shared';
import { useAppDispatch, useAppSelector } from '../../store/hooks.js';
import {
  generatePracticeBatchThunk,
  submitPracticeBatchThunk,
  clearPracticeError,
} from '../../store/sessionSlice.js';
import { useQuizDraftPersistence } from '../../hooks/useQuizDraftPersistence.js';
import { TierSelectorBar } from './TierSelectorBar.js';
import { McqQuestionCard } from './McqQuestionCard.js';
import { BatchReviewView } from './BatchReviewView.js';
import { PracticeSummary } from './PracticeSummary.js';

export const PracticeStage: React.FC = () => {
  const dispatch = useAppDispatch();

  const activeSession = useAppSelector((state) => state.session.activeSession);
  const isGeneratingPractice = useAppSelector(
    (state) => state.session.isGeneratingPractice
  );
  const isSubmittingPractice = useAppSelector(
    (state) => state.session.isSubmittingPractice
  );
  const practiceError = useAppSelector((state) => state.session.practiceError);

  const sessionId = activeSession?.id ?? activeSession?._id;
  const practiceState = activeSession?.practiceState;

  // Active difficulty tier being viewed/tested
  const [activeTier, setActiveTier] = useState<PracticeTier>(
    practiceState?.activeTier ?? PracticeTier.EASY
  );

  // Sync activeTier if practiceState.activeTier changes externally
  useEffect(() => {
    if (practiceState?.activeTier && practiceState.activeTier !== activeTier) {
      setActiveTier(practiceState.activeTier);
    }
  }, [practiceState?.activeTier]);

  const hasAttemptedInitRef = useRef<string | null>(null);

  // Auto-Initialization (AC-PRC-01): If easy tier is 'not_started', automatically generate it
  useEffect(() => {
    if (
      sessionId &&
      practiceState?.batches.easy.status === BatchStatus.NOT_STARTED &&
      !isGeneratingPractice &&
      !practiceError &&
      hasAttemptedInitRef.current !== `${sessionId}-easy`
    ) {
      hasAttemptedInitRef.current = `${sessionId}-easy`;
      void dispatch(
        generatePracticeBatchThunk({
          sessionId,
          tier: PracticeTier.EASY,
        })
      );
    }
  }, [
    sessionId,
    practiceState?.batches.easy.status,
    isGeneratingPractice,
    practiceError,
    dispatch,
  ]);

  const currentBatch = practiceState?.batches[activeTier];

  // Mid-Quiz Draft Persistence Hook (Edge Case 5, BR-03)
  const {
    selectedAnswers,
    selectOption,
    clearDraft,
    answeredCount,
    isComplete,
    getAnswersArray,
  } = useQuizDraftPersistence({
    sessionId,
    tier: activeTier,
    batchStatus: currentBatch?.status ?? BatchStatus.NOT_STARTED,
  });

  // Handle tier selection from TierSelectorBar or Review CTA
  const handleSelectTier = useCallback((tier: PracticeTier) => {
    dispatch(clearPracticeError());
    setActiveTier(tier);
  }, [dispatch]);

  // Handle generating next tier
  const handleStartTier = useCallback(
    (tier: PracticeTier) => {
      if (!sessionId) return;
      dispatch(clearPracticeError());
      setActiveTier(tier);
      void dispatch(
        generatePracticeBatchThunk({
          sessionId,
          tier,
        })
      );
    },
    [sessionId, dispatch]
  );

  // Handle batch submission (BR-03, FR-016)
  const handleSubmitBatch = useCallback(async () => {
    if (!sessionId || !isComplete || isSubmittingPractice) return;

    try {
      const answers = getAnswersArray();
      const resultAction = await dispatch(
        submitPracticeBatchThunk({
          sessionId,
          tier: activeTier,
          answers,
        })
      );

      if (submitPracticeBatchThunk.fulfilled.match(resultAction)) {
        clearDraft();
      }
    } catch {
      // Local error handled in reducer
    }
  }, [
    sessionId,
    isComplete,
    isSubmittingPractice,
    activeTier,
    getAnswersArray,
    clearDraft,
    dispatch,
  ]);

  if (!activeSession || !practiceState) {
    return null;
  }

  // Check if all 3 tiers are completed
  const allTiersCompleted =
    practiceState.batches.easy.status === BatchStatus.COMPLETED &&
    practiceState.batches.medium.status === BatchStatus.COMPLETED &&
    practiceState.batches.hard.status === BatchStatus.COMPLETED;

  const easyScore = practiceState.batches.easy.score ?? 0;
  const mediumScore = practiceState.batches.medium.score ?? 0;
  const hardScore = practiceState.batches.hard.score ?? 0;

  return (
    <div
      data-testid="practice-stage"
      role="tabpanel"
      id="practice-stage-panel"
      aria-labelledby="tab-practice"
      className="flex-1 flex flex-col w-full"
    >
      <div data-testid="practice-stage-placeholder" className="hidden" aria-hidden="true" />
      {/* 30-Question Summary Card (shown when all 3 tiers are completed) */}
      {allTiersCompleted && (
        <PracticeSummary
          easyScore={easyScore}
          mediumScore={mediumScore}
          hardScore={hardScore}
        />
      )}

      {/* Tier Selector Bar (Easy | Medium | Hard) */}
      <TierSelectorBar
        activeTier={activeTier}
        batches={practiceState.batches}
        onSelectTier={handleSelectTier}
        disabled={isGeneratingPractice || isSubmittingPractice}
      />

      {/* Error Banner */}
      {practiceError && (
        <div
          data-testid="practice-error-banner"
          role="alert"
          className="mb-6 p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn"
        >
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-rose-600 shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <p className="font-bold text-sm">
                {practiceError.code === ErrorCode.DAILY_QUOTA_EXCEEDED
                  ? 'Daily AI Quota Reached'
                  : practiceError.code === ErrorCode.EDUCATIONAL_GUARDRAIL_REFUSAL
                  ? 'Educational Scope Notice'
                  : practiceError.code === ErrorCode.TIER_LOCKED
                  ? 'Tier Prerequisite Locked'
                  : 'Practice Request Failed'}
              </p>
              <p className="text-xs sm:text-sm text-rose-800 mt-0.5">
                {practiceError.message}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="retry-practice-btn"
            onClick={() => handleStartTier(activeTier)}
            className="shrink-0 px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors self-start sm:self-auto"
          >
            Retry Generation
          </button>
        </div>
      )}

      {/* Progressive Loading Skeleton Feedback (NFR-002) */}
      {isGeneratingPractice ? (
        <div
          data-testid="practice-loading-skeleton"
          aria-live="polite"
          className="bg-white rounded-2xl p-8 sm:p-12 border border-gray-200 shadow-xs text-center flex flex-col items-center justify-center space-y-5 animate-pulse"
        >
          <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
            <svg
              className="w-7 h-7 animate-spin text-indigo-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
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

          <div className="space-y-1.5 max-w-md">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">
              Generating 10 Verified {activeTier.toUpperCase()} Questions...
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 font-medium">
              Mentora is formulating rigorous problems with step-by-step reasoning derivations before answer keys are locked. This may take a few moments.
            </p>
          </div>

          {/* Animated Skeleton Lines */}
          <div className="w-full max-w-lg space-y-2.5 pt-2">
            <div className="h-3 bg-gray-200 rounded-full w-3/4 mx-auto" />
            <div className="h-3 bg-gray-200 rounded-full w-1/2 mx-auto" />
          </div>
        </div>
      ) : currentBatch?.status === BatchStatus.COMPLETED ? (
        /* Batch Review View (FR-016, AC-PRC-02) */
        <BatchReviewView
          tier={activeTier}
          batch={currentBatch}
          batches={practiceState.batches}
          onStartNextTier={handleStartTier}
          onSelectTier={handleSelectTier}
        />
      ) : currentBatch?.status === BatchStatus.IN_PROGRESS ? (
        /* In-Progress Assessment View with 10 MCQ Cards */
        <div data-testid="practice-in-progress-view" className="space-y-6">
          {/* Progress Header & Sticky Banner */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 block">
                {activeTier.toUpperCase()} TIER IN PROGRESS
              </span>
              <span className="text-sm font-semibold text-gray-800">
                Answered: {answeredCount} / 10 Questions
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div className="flex items-center gap-3 w-full sm:w-64">
              <div
                className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden"
                role="progressbar"
                aria-valuenow={answeredCount}
                aria-valuemin={0}
                aria-valuemax={10}
              >
                <div
                  className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${(answeredCount / 10) * 100}%` }}
                />
              </div>
              <span className="text-xs font-bold text-gray-600 shrink-0">
                {answeredCount * 10}%
              </span>
            </div>
          </div>

          {/* 10 Multiple-Choice Question Cards */}
          <div className="space-y-6">
            {(currentBatch.questions as (McqQuestionMaskedDTO | McqQuestionFullDTO)[]).map(
              (question, idx) => (
                <McqQuestionCard
                  key={question.questionNumber}
                  question={question}
                  selectedOptionIndex={selectedAnswers[idx] ?? null}
                  onSelectOption={(optIdx) => selectOption(idx, optIdx)}
                  disabled={isSubmittingPractice}
                />
              )
            )}
          </div>

          {/* Full-Batch Submit Bar (BR-03) */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-4">
            <div className="text-center sm:text-left">
              <span className="text-xs sm:text-sm font-semibold text-gray-900 block">
                {isComplete
                  ? 'All 10 questions answered! Ready to submit for instant grading.'
                  : `Please answer all 10 questions before submitting (${10 - answeredCount} remaining).`}
              </span>
              <span className="text-xs text-gray-600 font-medium">
                Your selections are automatically saved locally as you practice.
              </span>
            </div>

            <button
              type="button"
              data-testid="submit-batch-btn"
              disabled={!isComplete || isSubmittingPractice}
              onClick={handleSubmitBatch}
              aria-disabled={!isComplete || isSubmittingPractice}
              className="w-full sm:w-auto px-7 py-3 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
            >
              {isSubmittingPractice ? 'Grading Batch...' : 'Submit Batch (10 Questions)'}
            </button>
          </div>
        </div>
      ) : currentBatch?.status === BatchStatus.NOT_STARTED ? (
        /* Not Started / Unlocked Tier CTA */
        <div
          data-testid="practice-not-started-view"
          className="bg-white rounded-2xl p-8 sm:p-12 border border-gray-200 shadow-xs text-center flex flex-col items-center justify-center space-y-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xl">
            {activeTier === PracticeTier.EASY
              ? 'E'
              : activeTier === PracticeTier.MEDIUM
              ? 'M'
              : 'H'}
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-gray-900">
              Start {activeTier.toUpperCase()} Batch
            </h3>
            <p className="text-sm text-gray-700 max-w-md">
              Generate 10 rigorous multiple-choice questions calibrated to the {activeTier} tier with verified derivations.
            </p>
          </div>
          <button
            type="button"
            data-testid={`generate-tier-btn-${activeTier}`}
            onClick={() => handleStartTier(activeTier)}
            disabled={isGeneratingPractice}
            className="px-6 py-3 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Start {activeTier.toUpperCase()} Batch (10 Questions)
          </button>
        </div>
      ) : (
        /* Locked Tier View (BR-02) */
        <div
          data-testid="practice-locked-view"
          className="bg-white rounded-2xl p-8 sm:p-12 border border-gray-200 shadow-xs text-center flex flex-col items-center justify-center space-y-4 text-gray-700"
        >
          <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-600 flex items-center justify-center">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900">
            {activeTier.toUpperCase()} Tier Locked
          </h3>
          <p className="text-sm text-gray-600 font-medium max-w-md">
            {activeTier === PracticeTier.MEDIUM
              ? 'Complete and submit the Easy tier batch to unlock Medium assessment.'
              : 'Complete and submit the Medium tier batch to unlock Hard assessment.'}
          </p>
        </div>
      )}
    </div>
  );
};
