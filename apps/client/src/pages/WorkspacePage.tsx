import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LearningMode,
  MAX_TOPIC_QUERY_LENGTH,
  CreateSessionRequestSchema,
} from '@mentora/shared';
import { useAppDispatch, useAppSelector } from '../store/hooks.js';
import {
  fetchSessionsThunk,
  fetchSessionByIdThunk,
  createSessionThunk,
  clearSessionError,
} from '../store/sessionSlice.js';
import { toggleMobileDrawer } from '../store/uiSlice.js';
import { LeftHistorySidebar } from '../components/layout/LeftHistorySidebar.js';
import { StickyTopicHeader } from '../components/layout/StickyTopicHeader.js';
import { ProfileSettingsModal } from '../components/layout/ProfileSettingsModal.js';

interface ModeOption {
  mode: LearningMode;
  title: string;
  badge: string;
  description: string;
}

const INITIAL_MODE_OPTIONS: ModeOption[] = [
  {
    mode: LearningMode.EXPLAIN,
    title: 'Explain Mode',
    badge: '4 Progressive Cards',
    description:
      'Intuition, core mechanisms, real-world examples, and self-checks with on-demand deep dives.',
  },
  {
    mode: LearningMode.INTERACT,
    title: 'Interact Mode',
    badge: 'Socratic Dialogue',
    description:
      'Structured 3–5 milestone guided discovery with deterministic 3-strike circuit breaker.',
  },
  {
    mode: LearningMode.PRACTICE,
    title: 'Practice Mode',
    badge: '10-MCQ Batches',
    description:
      'Sequential Easy → Medium → Hard mastery batches with step-by-step reasoning derivation.',
  },
];

export const WorkspacePage: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId?: string }>();

  const activeSession = useAppSelector((state) => state.session.activeSession);
  const activeMode = useAppSelector((state) => state.session.activeMode);
  const isCreatingSession = useAppSelector((state) => state.session.isCreatingSession);
  const sessionError = useAppSelector((state) => state.session.error);

  const [topicQuery, setTopicQuery] = useState('');
  const [selectedInitialMode, setSelectedInitialMode] = useState<LearningMode>(LearningMode.EXPLAIN);
  const [clientValidationError, setClientValidationError] = useState<string | null>(null);

  // 1. Initial sessions list hydration on mount
  useEffect(() => {
    void dispatch(fetchSessionsThunk());
  }, [dispatch]);

  // 2. Direct session deep-link hydration (/workspace/:sessionId)
  useEffect(() => {
    if (
      sessionId &&
      (!activeSession || (activeSession.id !== sessionId && activeSession._id !== sessionId))
    ) {
      void dispatch(fetchSessionByIdThunk(sessionId));
    }
  }, [sessionId, activeSession, dispatch]);

  const handleInputChange = (value: string) => {
    setTopicQuery(value);
    if (clientValidationError) {
      setClientValidationError(null);
    }
    if (sessionError) {
      dispatch(clearSessionError());
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientValidationError(null);

    const validation = CreateSessionRequestSchema.safeParse({
      topicQuery: topicQuery.trim(),
      initialMode: selectedInitialMode,
    });

    if (!validation.success) {
      setClientValidationError(
        validation.error.issues[0]?.message || 'Please enter a valid topic (1-300 characters).'
      );
      return;
    }

    const actionResult = await dispatch(createSessionThunk(validation.data));
    if (createSessionThunk.fulfilled.match(actionResult)) {
      const createdSession = actionResult.payload.data;
      navigate(`/workspace/${createdSession.id}`);
      setTopicQuery('');
    }
  };

  const isEducationalRefusal = sessionError?.code === 'EDUCATIONAL_GUARDRAIL_REFUSAL';

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* 1. Left History Sidebar (Desktop & Mobile Drawer) */}
      <LeftHistorySidebar />

      {/* 2. Main Workspace Viewport */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* If no active session, render New Topic Input Stage */}
        {activeSession === null ? (
          <div className="flex-1 flex flex-col">
            {/* Mobile Top Navbar for Drawer Access */}
            <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => dispatch(toggleMobileDrawer())}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  aria-label="Open sidebar menu"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <span className="font-bold text-gray-900 tracking-tight">Mentora</span>
              </div>
            </div>

            {/* New Topic Stage Hero Form */}
            <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
              <div className="max-w-2xl w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-10 space-y-8">
                {/* Header */}
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 text-white font-bold text-xl shadow-md">
                    M
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                    What topic would you like to master?
                  </h1>
                  <p className="text-sm text-gray-600 max-w-lg mx-auto">
                    Enter any academic theory, mathematical principle, system architecture, or skill to begin your personalized tutoring session.
                  </p>
                </div>

                {/* Educational Guardrail Refusal Notice (Edge Case 2) */}
                {isEducationalRefusal && (
                  <div
                    role="alert"
                    className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 space-y-1"
                  >
                    <div className="flex items-center space-x-2 font-semibold">
                      <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>Educational Scope Guardrail Notice</span>
                    </div>
                    <p className="text-xs text-red-700 leading-relaxed">
                      {sessionError?.message ||
                        'Mentora is calibrated exclusively for educational concepts, theories, and academic topics. Please rephrase your query around an educational learning subject.'}
                    </p>
                  </div>
                )}

                {/* General Session Error */}
                {!isEducationalRefusal && (clientValidationError || sessionError) && (
                  <div
                    role="alert"
                    className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800"
                  >
                    <p className="font-semibold">Unable to start session</p>
                    <p className="text-xs mt-0.5">
                      {clientValidationError || sessionError?.message}
                    </p>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleCreateSession} className="space-y-6">
                  {/* Topic Textarea */}
                  <div>
                    <label
                      htmlFor="topic-input"
                      className="block text-sm font-semibold text-gray-800 mb-1"
                    >
                      Topic or Question
                    </label>
                    <div className="relative">
                      <textarea
                        id="topic-input"
                        rows={3}
                        required
                        maxLength={MAX_TOPIC_QUERY_LENGTH}
                        value={topicQuery}
                        onChange={(e) => handleInputChange(e.target.value)}
                        placeholder="e.g. Distributed Consensus in Raft, Eigenvalues & Eigenvectors, or RNA Splicing..."
                        className="block w-full p-3.5 border border-gray-300 rounded-xl shadow-xs text-sm sm:text-base focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 transition-all resize-none"
                      />
                      <div className="absolute right-3 bottom-2.5 text-[11px] font-medium text-gray-400">
                        {topicQuery.length} / {MAX_TOPIC_QUERY_LENGTH}
                      </div>
                    </div>
                  </div>

                  {/* Mode Selector */}
                  <div>
                    <span className="block text-sm font-semibold text-gray-800 mb-2">
                      Select Starting Learning Mode
                    </span>
                    <div
                      role="radiogroup"
                      aria-label="Initial Learning Mode"
                      className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                    >
                      {INITIAL_MODE_OPTIONS.map((opt) => {
                        const isSelected = selectedInitialMode === opt.mode;
                        return (
                          <div
                            key={opt.mode}
                            role="radio"
                            aria-checked={isSelected}
                            tabIndex={0}
                            onClick={() => setSelectedInitialMode(opt.mode)}
                            onKeyDown={(e) => {
                              if (e.key === ' ' || e.key === 'Enter') {
                                e.preventDefault();
                                setSelectedInitialMode(opt.mode);
                              }
                            }}
                            className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                              isSelected
                                ? 'border-indigo-600 bg-indigo-50/50 shadow-xs'
                                : 'border-gray-200 hover:border-gray-300 bg-white'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-xs sm:text-sm text-gray-900">
                                  {opt.title}
                                </span>
                                <div
                                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                    isSelected
                                      ? 'border-indigo-600 bg-indigo-600'
                                      : 'border-gray-300'
                                  }`}
                                >
                                  {isSelected && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                  )}
                                </div>
                              </div>
                              <span className="inline-block text-[10px] font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                                {opt.badge}
                              </span>
                              <p className="text-[11px] text-gray-500 leading-tight pt-1">
                                {opt.description}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div>
                    <button
                      type="submit"
                      disabled={!topicQuery.trim() || isCreatingSession}
                      className="w-full flex justify-center py-3 px-6 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {isCreatingSession ? 'Initializing Tutoring Session...' : 'Start Learning Session'}
                    </button>
                  </div>
                </form>
              </div>
            </main>
          </div>
        ) : (
          /* Active Topic Session Workspace Shell */
          <div className="flex-1 flex flex-col">
            {/* Sticky Topic Header + Mode Switcher Tabs */}
            <StickyTopicHeader />

            {/* Active Stage Container with Mode Placeholders */}
            <main className="flex-1 p-4 sm:p-6 lg:p-8 flex flex-col max-w-5xl w-full mx-auto">
              {activeMode === LearningMode.EXPLAIN && (
                <div
                  data-testid="explain-stage-placeholder"
                  role="tabpanel"
                  id="explain-stage-panel"
                  aria-labelledby="tab-explain"
                  className="flex-1 bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-center items-center text-center space-y-4"
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xl">
                    E
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                    Explain Mode
                  </h2>
                  <p className="text-sm text-gray-600 max-w-md">
                    Progressive 4-card breakdown (Intuition → Mechanism → Example → Check) with on-demand Go Deeper sub-cards for <span className="font-semibold text-gray-800">"{activeSession.normalizedTitle || activeSession.topicQuery}"</span>.
                  </p>
                  <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    Stage Engine Integration — Phase 5 (`IMP-016`)
                  </div>
                </div>
              )}

              {activeMode === LearningMode.INTERACT && (
                <div
                  data-testid="interact-stage-placeholder"
                  role="tabpanel"
                  id="interact-stage-panel"
                  aria-labelledby="tab-interact"
                  className="flex-1 bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-center items-center text-center space-y-4"
                >
                  <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-xl">
                    I
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                    Interact Mode
                  </h2>
                  <p className="text-sm text-gray-600 max-w-md">
                    Goal-driven Socratic dialogue across 3–5 conceptual milestones with 3-Strike Circuit Breaker via SSE for <span className="font-semibold text-gray-800">"{activeSession.normalizedTitle || activeSession.topicQuery}"</span>.
                  </p>
                  <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                    Socratic SSE Engine Integration — Phase 6 (`IMP-019`)
                  </div>
                </div>
              )}

              {activeMode === LearningMode.PRACTICE && (
                <div
                  data-testid="practice-stage-placeholder"
                  role="tabpanel"
                  id="practice-stage-panel"
                  aria-labelledby="tab-practice"
                  className="flex-1 bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-center items-center text-center space-y-4"
                >
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xl">
                    P
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                    Practice Mode
                  </h2>
                  <p className="text-sm text-gray-600 max-w-md">
                    Mastery assessment batches across Easy → Medium → Hard tiers with reasoning derivation and answer masking for <span className="font-semibold text-gray-800">"{activeSession.normalizedTitle || activeSession.topicQuery}"</span>.
                  </p>
                  <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Tiered MCQ Engine Integration — Phase 7 (`IMP-022`)
                  </div>
                </div>
              )}
            </main>
          </div>
        )}
      </div>

      {/* Profile Settings Modal */}
      <ProfileSettingsModal />
    </div>
  );
};

export default WorkspacePage;
