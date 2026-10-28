// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { AxiosAdapter } from 'axios';
import '@testing-library/jest-dom/vitest';
import {
  EducationLevel,
  ExplanationStyle,
  LearningMode,
  ExplainStatus,
  InteractStatus,
  PracticeTier,
  BatchStatus,
  type TopicSessionDTO,
  type UserDTO,
  type McqQuestionMaskedDTO,
  type McqQuestionFullDTO,
  type PracticeBatchDTO,
} from '@mentora/shared';
import { apiClient, clearStoredToken } from '../services/apiClient.js';
import { createAppStore, type PreloadedRootState } from '../store/index.js';
import { WorkspacePage } from '../pages/WorkspacePage.js';
import { getQuizDraftStorageKey } from '../hooks/useQuizDraftPersistence.js';

// Mock mermaid for JSDOM
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn().mockResolvedValue({}),
    render: vi.fn().mockImplementation(async (id: string, code: string) => ({
      svg: `<svg id="${id}" data-testid="mocked-mermaid"><text>${code}</text></svg>`,
    })),
  },
}));

describe('IMP-024: Frontend End-to-End Practice Mode Progression & Draft Preservation', () => {
  const originalAdapter = apiClient.defaults.adapter;

  const mockUser: UserDTO = {
    id: 'user-knuth',
    _id: 'user-knuth',
    name: 'Donald Knuth',
    email: 'knuth@example.com',
    profile: {
      isCompleted: true,
      educationLevel: EducationLevel.UNDERGRADUATE,
      preferredStyle: ExplanationStyle.VISUAL,
    },
    usageQuota: {
      dailyCount: 0,
      dailyLimit: 50,
      windowResetAt: '2026-10-28T00:00:00.000Z',
    },
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z',
  };

  const createMockMaskedQuestions = (tier: PracticeTier): McqQuestionMaskedDTO[] =>
    Array.from({ length: 10 }, (_, i) => ({
      questionNumber: i + 1,
      questionText: `[${tier.toUpperCase()}] Question ${i + 1}: What is the time complexity of operation ${i + 1}?`,
      options: [
        '$\\mathcal{O}(1)$',
        '$\\mathcal{O}(\\log n)$',
        '$\\mathcal{O}(n)$',
        '$\\mathcal{O}(n^2)$',
      ],
      hint: `[${tier.toUpperCase()}] Hint for question ${i + 1}: look at the tree partitioning.`,
    }));

  const createMockFullQuestions = (tier: PracticeTier): McqQuestionFullDTO[] =>
    Array.from({ length: 10 }, (_, i) => ({
      questionNumber: i + 1,
      questionText: `[${tier.toUpperCase()}] Question ${i + 1}: What is the time complexity of operation ${i + 1}?`,
      options: [
        '$\\mathcal{O}(1)$',
        '$\\mathcal{O}(\\log n)$',
        '$\\mathcal{O}(n)$',
        '$\\mathcal{O}(n^2)$',
      ],
      hint: `[${tier.toUpperCase()}] Hint for question ${i + 1}: look at the tree partitioning.`,
      solutionExplanation: `REASONING: For [${tier.toUpperCase()}] question ${i + 1}, logarithmic binary division confirms Option index ${i % 4} is correct.`,
      correctOptionIndex: i % 4,
    }));

  const createBatchDTO = (
    tier: PracticeTier,
    status: BatchStatus,
    questions: McqQuestionMaskedDTO[] | McqQuestionFullDTO[] = [],
    score: number | null = null,
    userAnswers: number[] = []
  ): PracticeBatchDTO => {
    if (status === BatchStatus.COMPLETED) {
      return {
        tier,
        status: BatchStatus.COMPLETED,
        score,
        questions: questions as McqQuestionFullDTO[],
        userAnswers,
        completedAt: '2026-10-28T12:00:00.000Z',
      };
    }
    if (status === BatchStatus.IN_PROGRESS) {
      return {
        tier,
        status: BatchStatus.IN_PROGRESS,
        score: null,
        questions: questions as McqQuestionMaskedDTO[],
        userAnswers: [],
        completedAt: null,
      };
    }
    if (status === BatchStatus.LOCKED) {
      return {
        tier,
        status: BatchStatus.LOCKED,
        score: null,
        questions: [],
        userAnswers: [],
        completedAt: null,
      };
    }
    return {
      tier,
      status: BatchStatus.NOT_STARTED,
      score: null,
      questions: [],
      userAnswers: [],
      completedAt: null,
    };
  };

  const createInitialSessionDTO = (
    id = 'session-prc-e2e-1',
    topicQuery = 'Binary Search Trees & Balancing'
  ): TopicSessionDTO => ({
    id,
    _id: id,
    userId: mockUser.id,
    topicQuery,
    normalizedTitle: topicQuery,
    lastActiveMode: LearningMode.PRACTICE,
    explainState: {
      status: ExplainStatus.NOT_STARTED,
      currentStepIndex: 0,
      cards: [],
      suggestedSubTopics: [],
    },
    interactState: {
      status: InteractStatus.NOT_STARTED,
      activeMilestoneIndex: 0,
      strikeCount: 0,
      milestones: [],
      messages: [],
    },
    practiceState: {
      activeTier: PracticeTier.EASY,
      batches: {
        easy: createBatchDTO(PracticeTier.EASY, BatchStatus.NOT_STARTED),
        medium: createBatchDTO(PracticeTier.MEDIUM, BatchStatus.LOCKED),
        hard: createBatchDTO(PracticeTier.HARD, BatchStatus.LOCKED),
      },
    },
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z',
  });

  const renderWorkspace = (
    initialEntries = ['/workspace'],
    preloadedState?: PreloadedRootState
  ) => {
    const store = createAppStore(preloadedState);
    const view = render(
      <Provider store={store}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/workspace" element={<WorkspacePage />} />
            <Route path="/workspace/:sessionId" element={<WorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );
    return { store, ...view };
  };

  beforeEach(() => {
    cleanup();
    clearStoredToken();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
    apiClient.defaults.adapter = originalAdapter;
    vi.restoreAllMocks();
  });

  describe('1. Full 30-Question Ladder User Journey (Easy -> Medium -> Hard -> Practice Summary)', () => {
    it('executes full ladder: topic entry -> auto-gen Easy -> submit -> Medium unlock & generation -> submit -> Hard unlock & generation -> submit -> 30-question summary', async () => {
      let activeSessionData = createInitialSessionDTO();
      let quotaCount = 0;

      const mockAdapter: AxiosAdapter = async (config) => {
        const url = config.url || '';
        const method = (config.method || 'GET').toUpperCase();

        // 1. Initial sessions list for sidebar
        if ((url === '/sessions' || url.endsWith('/sessions')) && method === 'GET') {
          return {
            data: { success: true, data: [] },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }

        // 2. Fetch session by ID
        if (url.includes('/sessions/') && method === 'GET') {
          return {
            data: { success: true, data: activeSessionData },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }

        // 3. Create session
        if ((url === '/sessions' || url.endsWith('/sessions')) && method === 'POST') {
          const body = JSON.parse(config.data as string);
          activeSessionData = {
            ...activeSessionData,
            topicQuery: body.topicQuery,
            normalizedTitle: body.topicQuery,
            lastActiveMode: body.initialMode ?? LearningMode.PRACTICE,
          };
          return {
            data: { success: true, data: activeSessionData },
            status: 201,
            statusText: 'Created',
            headers: {},
            config,
          };
        }

        // 4. Generate Practice Batch
        if (url.includes('/practice/generate') && method === 'POST') {
          const body = JSON.parse(config.data as string);
          const tier = body.tier as PracticeTier;
          quotaCount++;
          const maskedQuestions = createMockMaskedQuestions(tier);

          activeSessionData = {
            ...activeSessionData,
            lastActiveMode: LearningMode.PRACTICE,
            practiceState: {
              ...activeSessionData.practiceState,
              activeTier: tier,
              batches: {
                ...activeSessionData.practiceState.batches,
                [tier]: createBatchDTO(tier, BatchStatus.IN_PROGRESS, maskedQuestions),
              },
            },
          };

          return {
            data: {
              success: true,
              data: activeSessionData,
              meta: {
                quota: { used: quotaCount, limit: 50, resetAt: '2026-10-28T00:00:00.000Z' },
              },
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }

        // 5. Submit Practice Batch
        if (url.includes('/practice/submit') && method === 'POST') {
          const body = JSON.parse(config.data as string);
          const tier = body.tier as PracticeTier;
          const answers = body.answers as number[];
          const fullQuestions = createMockFullQuestions(tier);

          let score = 0;
          for (let i = 0; i < 10; i++) {
            if (answers[i] === fullQuestions[i]?.correctOptionIndex) {
              score++;
            }
          }

          const nextTier =
            tier === PracticeTier.EASY
              ? PracticeTier.MEDIUM
              : tier === PracticeTier.MEDIUM
              ? PracticeTier.HARD
              : null;

          activeSessionData = {
            ...activeSessionData,
            practiceState: {
              ...activeSessionData.practiceState,
              activeTier: tier,
              batches: {
                ...activeSessionData.practiceState.batches,
                [tier]: createBatchDTO(tier, BatchStatus.COMPLETED, fullQuestions, score, answers),
                ...(nextTier
                  ? { [nextTier]: createBatchDTO(nextTier, BatchStatus.NOT_STARTED) }
                  : {}),
              },
            },
          };

          return {
            data: {
              success: true,
              data: activeSessionData,
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }

        // 6. Switch Mode
        if (url.includes('/mode') && method === 'PATCH') {
          const body = JSON.parse(config.data as string);
          activeSessionData = {
            ...activeSessionData,
            lastActiveMode: body.mode,
          };
          return {
            data: { success: true, data: activeSessionData },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }

        return {
          data: { success: true, data: activeSessionData },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };

      apiClient.defaults.adapter = mockAdapter;

      // Mount on /workspace with authenticated user and no active session
      renderWorkspace(['/workspace'], {
        auth: {
          user: mockUser,
          token: 'mock-jwt-token',
          authStatus: 'authenticated',
          quota: { used: 0, limit: 50, resetAt: '2026-10-28T00:00:00.000Z' },
          error: null,
        },
        session: {
          sessionList: [],
          activeSession: null,
          activeMode: LearningMode.PRACTICE,
          isLoadingList: false,
          isLoadingSession: false,
          isCreatingSession: false,
          isInitializingExplain: false,
          deepDiveLoadingStep: null,
          explainError: null,
          isInitializingInteract: false,
          interactError: null,
          isGeneratingPractice: false,
          isSubmittingPractice: false,
          practiceError: null,
          error: null,
          streamingState: {
            isStreaming: false,
            streamBuffer: '',
            streamError: null,
            activeTurnId: null,
            activeTurnMessage: null,
          },
        },
      });

      // Step A: Topic input hero form is displayed
      expect(screen.getByText('What topic would you like to master?')).toBeInTheDocument();

      const textarea = screen.getByLabelText(/Topic or Question/i);
      fireEvent.change(textarea, {
        target: { value: 'Binary Search Trees & Balancing' },
      });

      // Select Practice Mode radio
      const practiceRadio = screen.getByRole('radio', { name: /Practice Mode/i });
      fireEvent.click(practiceRadio);

      // Click "Start Learning Session"
      const startButton = screen.getByRole('button', {
        name: /Start Learning Session/i,
      });
      fireEvent.click(startButton);

      // Step B: Auto-generates Easy batch and renders Question 1
      await waitFor(() => {
        expect(screen.getByText(/\[EASY\] Question 1:/i)).toBeInTheDocument();
      });

      // Verify TierSelectorBar shows Easy active, Medium and Hard locked
      expect(screen.getByTestId('tier-tab-easy')).toBeInTheDocument();
      expect(screen.getByTestId('tier-tab-medium')).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByTestId('tier-tab-hard')).toHaveAttribute('aria-disabled', 'true');

      // Verify localStorage draft key exists
      const easyDraftKey = getQuizDraftStorageKey('session-prc-e2e-1', PracticeTier.EASY);

      // Step C: Answer 10 Easy questions (questions 1..9 matching i%4, question 10 choice 3 -> score 9/10)
      for (let qNum = 1; qNum <= 10; qNum++) {
        const optIdx = qNum === 10 ? 3 : (qNum - 1) % 4;
        const optionBtn = screen.getByTestId(`mcq-option-${qNum}-${optIdx}`);
        fireEvent.click(optionBtn);
      }

      // Verify localStorage draft contains answers
      expect(window.localStorage.getItem(easyDraftKey)).not.toBeNull();
      expect(screen.getByText(/Answered: 10 \/ 10 Questions/i)).toBeInTheDocument();

      // Submit Easy Batch
      const submitEasyBtn = screen.getByTestId('submit-batch-btn');
      expect(submitEasyBtn).not.toBeDisabled();
      fireEvent.click(submitEasyBtn);

      // Step D: Batch Review view appears with 9/10 score and "Start Medium Batch" CTA
      await waitFor(() => {
        expect(screen.getByTestId('batch-score-banner')).toBeInTheDocument();
      });
      expect(screen.getByText(/Batch Score: 9 \/ 10 \(90%\)/i)).toBeInTheDocument();
      expect(window.localStorage.getItem(easyDraftKey)).toBeNull(); // Cleared upon submit

      const startMediumBtn = screen.getByTestId('start-next-tier-btn-medium');
      expect(startMediumBtn).toBeInTheDocument();
      expect(startMediumBtn).toHaveTextContent(/Start Medium Batch \(10 Questions\)/i);

      // Step E: Click "Start Medium Batch (10 Questions)"
      fireEvent.click(startMediumBtn);

      await waitFor(() => {
        expect(screen.getByText(/\[MEDIUM\] Question 1:/i)).toBeInTheDocument();
      });

      // Answer 10 Medium questions (questions 1..8 correct, 9..10 choice 3 -> score 8/10)
      for (let qNum = 1; qNum <= 10; qNum++) {
        const optIdx = qNum >= 9 ? 3 : (qNum - 1) % 4;
        const optionBtn = screen.getByTestId(`mcq-option-${qNum}-${optIdx}`);
        fireEvent.click(optionBtn);
      }

      const submitMedBtn = screen.getByTestId('submit-batch-btn');
      fireEvent.click(submitMedBtn);

      // Step F: Medium Review view appears with 8/10 score and "Start Hard Batch" CTA
      await waitFor(() => {
        expect(screen.getByText(/Batch Score: 8 \/ 10 \(80%\)/i)).toBeInTheDocument();
      });

      const startHardBtn = screen.getByTestId('start-next-tier-btn-hard');
      expect(startHardBtn).toBeInTheDocument();
      expect(startHardBtn).toHaveTextContent(/Start Hard Batch \(10 Questions\)/i);

      // Step G: Click "Start Hard Batch (10 Questions)"
      fireEvent.click(startHardBtn);

      await waitFor(() => {
        expect(screen.getByText(/\[HARD\] Question 1:/i)).toBeInTheDocument();
      });

      // Answer 10 Hard questions (questions 1..7 correct, 8..10 incorrect -> score 7/10)
      for (let qNum = 1; qNum <= 10; qNum++) {
        const optIdx =
          qNum === 8 ? 0 : qNum === 9 ? 1 : qNum === 10 ? 2 : (qNum - 1) % 4;
        const optionBtn = screen.getByTestId(`mcq-option-${qNum}-${optIdx}`);
        fireEvent.click(optionBtn);
      }

      const submitHardBtn = screen.getByTestId('submit-batch-btn');
      fireEvent.click(submitHardBtn);

      // Step H: All 3 Tiers Completed -> 30-Question Summary Card renders!
      await waitFor(() => {
        expect(screen.getByTestId('practice-summary-card')).toBeInTheDocument();
      });

      expect(screen.getByText(/Topic Practice Summary/i)).toBeInTheDocument();
      // Total score: 9 + 8 + 7 = 24 / 30 (80% Overall Accuracy)
      expect(screen.getByTestId('total-score-display')).toHaveTextContent(/24/);
      expect(screen.getByTestId('total-score-display')).toHaveTextContent(/\/ 30/);
      expect(screen.getByTestId('total-score-display')).toHaveTextContent(/80% Overall Accuracy/);

      // Individual tier pill checks
      expect(screen.getByTestId('tier-score-easy')).toHaveTextContent(/9/);
      expect(screen.getByTestId('tier-score-medium')).toHaveTextContent(/8/);
      expect(screen.getByTestId('tier-score-hard')).toHaveTextContent(/7/);

      // Step I: Learner can switch between Easy, Medium, and Hard tabs in TierSelectorBar to review past questions
      const easyTab = screen.getByTestId('tier-tab-easy');
      fireEvent.click(easyTab);
      await waitFor(() => {
        expect(screen.getByTestId('batch-score-banner')).toHaveTextContent(/Batch Score: 9 \/ 10/i);
      });

      const mediumTab = screen.getByTestId('tier-tab-medium');
      fireEvent.click(mediumTab);
      await waitFor(() => {
        expect(screen.getByTestId('batch-score-banner')).toHaveTextContent(/Batch Score: 8 \/ 10/i);
      });

      const hardTab = screen.getByTestId('tier-tab-hard');
      fireEvent.click(hardTab);
      await waitFor(() => {
        expect(screen.getByTestId('batch-score-banner')).toHaveTextContent(/Batch Score: 7 \/ 10/i);
      });
    }, 15000);
  });

  describe('2. Mid-Quiz Mode Tab Switch & Draft Restoration (FR-005, Edge Case 5)', () => {
    it('preserves partial quiz selections in localStorage across mode tab switches without losing state', async () => {
      const sessionId = 'session-prc-draft-test';
      const easyQuestions = createMockMaskedQuestions(PracticeTier.EASY);

      let activeSessionData: TopicSessionDTO = {
        id: sessionId,
        _id: sessionId,
        userId: mockUser.id,
        topicQuery: 'Binary Search Trees & Balancing',
        normalizedTitle: 'Binary Search Trees & Balancing',
        lastActiveMode: LearningMode.PRACTICE,
        explainState: {
          status: ExplainStatus.NOT_STARTED,
          currentStepIndex: 0,
          cards: [],
          suggestedSubTopics: [],
        },
        interactState: {
          status: InteractStatus.NOT_STARTED,
          activeMilestoneIndex: 0,
          strikeCount: 0,
          milestones: [],
          messages: [],
        },
        practiceState: {
          activeTier: PracticeTier.EASY,
          batches: {
            easy: createBatchDTO(PracticeTier.EASY, BatchStatus.IN_PROGRESS, easyQuestions),
            medium: createBatchDTO(PracticeTier.MEDIUM, BatchStatus.LOCKED),
            hard: createBatchDTO(PracticeTier.HARD, BatchStatus.LOCKED),
          },
        },
        createdAt: '2026-10-27T10:00:00.000Z',
        updatedAt: '2026-10-27T10:00:00.000Z',
      };

      const mockAdapter: AxiosAdapter = async (config) => {
        const url = config.url || '';
        const method = (config.method || 'GET').toUpperCase();

        if ((url === '/sessions' || url.endsWith('/sessions')) && method === 'GET') {
          return {
            data: { success: true, data: [] },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }

        if (url.includes(`/sessions/${sessionId}`) && method === 'GET') {
          return {
            data: { success: true, data: activeSessionData },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }

        if (url.includes('/mode') && method === 'PATCH') {
          const body = JSON.parse(config.data as string);
          activeSessionData = {
            ...activeSessionData,
            lastActiveMode: body.mode,
          };
          return {
            data: { success: true, data: activeSessionData },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }

        // If ExplainStage auto-inits
        if (url.includes('/explain/init') && method === 'POST') {
          return {
            data: {
              success: true,
              data: {
                ...activeSessionData,
                explainState: {
                  status: ExplainStatus.READY,
                  currentStepIndex: 0,
                  cards: [],
                  suggestedSubTopics: [],
                },
              },
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }

        return {
          data: { success: true, data: activeSessionData },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };

      apiClient.defaults.adapter = mockAdapter;

      renderWorkspace([`/workspace/${sessionId}`], {
        auth: {
          user: mockUser,
          token: 'mock-jwt-token',
          authStatus: 'authenticated',
          quota: { used: 1, limit: 50, resetAt: '2026-10-28T00:00:00.000Z' },
          error: null,
        },
        session: {
          sessionList: [],
          activeSession: activeSessionData,
          activeMode: LearningMode.PRACTICE,
          isLoadingList: false,
          isLoadingSession: false,
          isCreatingSession: false,
          isInitializingExplain: false,
          deepDiveLoadingStep: null,
          explainError: null,
          isInitializingInteract: false,
          interactError: null,
          isGeneratingPractice: false,
          isSubmittingPractice: false,
          practiceError: null,
          error: null,
          streamingState: {
            isStreaming: false,
            streamBuffer: '',
            streamError: null,
            activeTurnId: null,
            activeTurnMessage: null,
          },
        },
      });

      // Verify PracticeStage is mounted with 0 / 10 answered
      await waitFor(() => {
        expect(screen.getByText(/\[EASY\] Question 1:/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Answered: 0 \/ 10 Questions/i)).toBeInTheDocument();

      // Step A: User answers questions 1, 2, 3, 4
      fireEvent.click(screen.getByTestId('mcq-option-1-0')); // Q1 Option A
      fireEvent.click(screen.getByTestId('mcq-option-2-1')); // Q2 Option B
      fireEvent.click(screen.getByTestId('mcq-option-3-2')); // Q3 Option C
      fireEvent.click(screen.getByTestId('mcq-option-4-3')); // Q4 Option D

      expect(screen.getByText(/Answered: 4 \/ 10 Questions/i)).toBeInTheDocument();

      // Verify localStorage draft is populated
      const draftKey = getQuizDraftStorageKey(sessionId, PracticeTier.EASY);
      const savedDraft = window.localStorage.getItem(draftKey);
      expect(savedDraft).not.toBeNull();
      const parsedDraft = JSON.parse(savedDraft!);
      expect(parsedDraft.selectedAnswers).toEqual([0, 1, 2, 3, null, null, null, null, null, null]);

      // Step B: Switch to Explain Mode Tab
      const explainTab = screen.getByRole('tab', { name: /Explain/i });
      fireEvent.click(explainTab);

      // Verify mode switched to Explain
      await waitFor(() => {
        expect(explainTab).toHaveAttribute('aria-selected', 'true');
      });

      // Step C: Switch back to Practice Mode Tab
      const practiceTab = screen.getByRole('tab', { name: /Practice/i });
      fireEvent.click(practiceTab);

      // Verify mode switched back to Practice
      await waitFor(() => {
        expect(practiceTab).toHaveAttribute('aria-selected', 'true');
      });

      // Step D: Verify draft restored from localStorage!
      await waitFor(() => {
        expect(screen.getByText(/Answered: 4 \/ 10 Questions/i)).toBeInTheDocument();
      });

      // Verify radio options for questions 1..4 are still checked
      expect(screen.getByTestId('mcq-option-1-0')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('mcq-option-2-1')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('mcq-option-3-2')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('mcq-option-4-3')).toHaveAttribute('aria-checked', 'true');
    });
  });
});
