import React, { useEffect, useRef, useCallback } from 'react';
import {
  InteractStatus,
  LearningMode,
} from '@mentora/shared';
import { useAppDispatch, useAppSelector } from '../../store/hooks.js';
import {
  initializeInteractThunk,
  switchSessionModeThunk,
  clearInteractError,
} from '../../store/sessionSlice.js';
import { useSseStream } from '../../hooks/useSseStream.js';
import { MilestoneTrackerBar } from './MilestoneTrackerBar.js';
import { ChatTranscript } from './ChatTranscript.js';
import { ChatInput } from './ChatInput.js';

export const InteractStage: React.FC = () => {
  const dispatch = useAppDispatch();

  const activeSession = useAppSelector((state) => state.session.activeSession);
  const isInitializingInteract = useAppSelector(
    (state) => state.session.isInitializingInteract
  );
  const interactError = useAppSelector((state) => state.session.interactError);

  const sessionId = activeSession?.id ?? activeSession?._id;
  const interactState = activeSession?.interactState;

  const hasAttemptedInitRef = useRef<string | null>(null);

  // Auto-Initialization: if interactState.status === 'not_started', dispatch initializeInteractThunk
  useEffect(() => {
    if (
      sessionId &&
      interactState?.status === InteractStatus.NOT_STARTED &&
      !isInitializingInteract &&
      !interactError &&
      hasAttemptedInitRef.current !== sessionId
    ) {
      hasAttemptedInitRef.current = sessionId;
      void dispatch(initializeInteractThunk(sessionId));
    }
  }, [sessionId, interactState?.status, isInitializingInteract, interactError, dispatch]);

  const {
    sendMessage,
    retryLastMessage,
    isStreaming,
    streamBuffer,
    streamError,
    activeTurnMessage,
  } = useSseStream(sessionId);

  const handleSwitchToPractice = useCallback(() => {
    if (!sessionId) {
      return;
    }
    void dispatch(
      switchSessionModeThunk({ id: sessionId, mode: LearningMode.PRACTICE })
    );
  }, [sessionId, dispatch]);

  const handleSwitchToExplain = useCallback(() => {
    if (!sessionId) {
      return;
    }
    void dispatch(
      switchSessionModeThunk({ id: sessionId, mode: LearningMode.EXPLAIN })
    );
  }, [sessionId, dispatch]);

  const handleRetryInit = useCallback(() => {
    if (sessionId) {
      dispatch(clearInteractError());
      hasAttemptedInitRef.current = null;
      void dispatch(initializeInteractThunk(sessionId));
    }
  }, [sessionId, dispatch]);

  // Loading Skeleton State (NFR-002)
  if (isInitializingInteract) {
    return (
      <div
        data-testid="interact-stage-skeleton"
        role="tabpanel"
        id="interact-stage-panel"
        aria-labelledby="tab-interact"
        className="flex-1 flex flex-col space-y-4 animate-pulse max-w-5xl w-full mx-auto"
      >
        {/* Milestone Tracker Skeleton */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
          <div className="h-5 bg-gray-200 rounded w-1/4" />
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl" />
            ))}
          </div>
        </div>

        {/* Chat Transcript Skeleton */}
        <div className="flex-1 min-h-[350px] bg-white rounded-2xl border border-gray-200 p-6 flex flex-col justify-center items-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-xl animate-spin">
            I
          </div>
          <p className="text-sm font-semibold text-gray-700">
            Decomposing topic into conceptual milestones...
          </p>
          <p className="text-xs text-gray-600 font-medium max-w-md text-center">
            Mentora is calibrating the Socratic dialogue and crafting an opening diagnostic question.
          </p>
        </div>

        {/* Chat Input Skeleton */}
        <div className="h-28 bg-white rounded-2xl border border-gray-200" />
      </div>
    );
  }

  // Initialization Error State
  if (interactError && interactState?.status === InteractStatus.NOT_STARTED) {
    return (
      <div
        data-testid="interact-error-banner"
        role="tabpanel"
        id="interact-stage-panel"
        aria-labelledby="tab-interact"
        className="flex-1 bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-rose-200 flex flex-col justify-center items-center text-center space-y-4 max-w-xl mx-auto my-auto"
      >
        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">
          Failed to Initialize Interact Mode
        </h2>
        <p className="text-sm text-gray-600">
          {interactError.message ||
            'An unexpected error occurred while preparing your Socratic dialogue.'}
        </p>
        <button
          type="button"
          onClick={handleRetryInit}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 transition shadow-xs"
        >
          Retry Initialization
        </button>
      </div>
    );
  }

  const milestones = interactState?.milestones ?? [];
  const activeMilestoneIndex = interactState?.activeMilestoneIndex ?? 0;
  const strikeCount = interactState?.strikeCount ?? 0;
  const messages = interactState?.messages ?? [];
  const isCompleted = interactState?.status === InteractStatus.COMPLETED;

  const activeMilestoneTitle =
    milestones[activeMilestoneIndex]?.title ?? undefined;

  return (
    <div
      data-testid="interact-stage"
      role="tabpanel"
      id="interact-stage-panel"
      aria-labelledby="tab-interact"
      className="flex-1 flex flex-col min-h-0 space-y-4 max-w-5xl w-full mx-auto"
    >
      {/* 1. Milestone Progress Tracker */}
      {milestones.length > 0 && (
        <MilestoneTrackerBar
          milestones={milestones}
          activeMilestoneIndex={activeMilestoneIndex}
          strikeCount={strikeCount}
          isCompleted={isCompleted}
        />
      )}

      {/* 2. Completion Banner (when all milestones are mastered) */}
      {isCompleted && (
        <div
          data-testid="interact-completed-banner"
          className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-left shadow-xs"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎉</span>
              <h3 className="text-sm font-bold text-emerald-950">
                All Milestones Successfully Mastered!
              </h3>
            </div>
            <p className="text-xs text-emerald-800 leading-relaxed max-w-xl">
              You completed the guided Socratic dialogue for this topic. Ready to test your
              understanding with tiered MCQs or review the core concepts?
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleSwitchToExplain}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-800 bg-white border border-emerald-200 hover:bg-emerald-100 transition shadow-2xs"
            >
              Review Explain Cards
            </button>
            <button
              type="button"
              onClick={handleSwitchToPractice}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-xs"
            >
              Start Practice MCQs →
            </button>
          </div>
        </div>
      )}

      {/* 3. Main Chat Transcript Area */}
      <div className="flex-1 min-h-[380px] overflow-hidden flex flex-col bg-slate-50/60 rounded-2xl border border-gray-200 shadow-2xs">
        <ChatTranscript
          messages={messages}
          isStreaming={isStreaming}
          streamBuffer={streamBuffer}
          streamError={streamError}
          activeTurnMessage={activeTurnMessage}
          onRetry={retryLastMessage}
        />
      </div>

      {/* 4. Chat Input Bar */}
      <ChatInput
        onSendMessage={sendMessage}
        isStreaming={isStreaming}
        disabled={isCompleted}
        activeMilestoneTitle={activeMilestoneTitle}
      />
    </div>
  );
};

export default InteractStage;

