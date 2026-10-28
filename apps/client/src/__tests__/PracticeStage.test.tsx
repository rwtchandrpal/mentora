// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
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
import { apiClient } from '../services/apiClient.js';
import { createAppStore, type PreloadedRootState } from '../store/index.js';
import { PracticeStage } from '../components/practice/PracticeStage.js';
import { getQuizDraftStorageKey } from '../hooks/useQuizDraftPersistence.js';

// Mock mermaid for JSDOM
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn().mockResolvedValue({}),
    render: vi.fn().mockImplementation(async (id: string, code: string) => ({
      svg: `<svg id="${id}" data-testid="mocked-svg"><text>${code}</text></svg>`,
    })),
  },
}));

describe('IMP-023: Frontend Practice Mode UI Stage & useQuizDraftPersistence', () => {
  const originalAdapter = apiClient.defaults.adapter;

  const mockUser: UserDTO = {
    id: 'user-789',
    _id: 'user-789',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    profile: {
      isCompleted: true,
      educationLevel: EducationLevel.UNDERGRADUATE,
      preferredStyle: ExplanationStyle.VISUAL,
    },
    usageQuota: {
      dailyCount: 2,
      dailyLimit: 50,
      windowResetAt: '2026-10-28T00:00:00.000Z',
    },
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z',
  };

  const createMockMaskedQuestions = (count = 10): McqQuestionMaskedDTO[] =>
    Array.from({ length: count }, (_, i) => ({
      questionNumber: i + 1,
      questionText: `Question ${i + 1}: What is the time complexity of operation $O(${i + 1})$?`,
      options: [
        '$\\mathcal{O}(1)$',
        '$\\mathcal{O}(\\log n)$',
        '$\\mathcal{O}(n)$',
        '$\\mathcal{O}(n^2)$',
      ],
      hint: `Hint for question ${i + 1}: look at the tree partitioning.`,
    }));

  const createMockFullQuestions = (count = 10): McqQuestionFullDTO[] =>
    Array.from({ length: count }, (_, i) => ({
      questionNumber: i + 1,
      questionText: `Question ${i + 1}: What is the time complexity of operation $O(${i + 1})$?`,
      options: [
        '$\\mathcal{O}(1)$',
        '$\\mathcal{O}(\\log n)$',
        '$\\mathcal{O}(n)$',
        '$\\mathcal{O}(n^2)$',
      ],
      hint: `Hint for question ${i + 1}: look at the tree partitioning.`,
      solutionExplanation: `Step-by-step derivation for question ${i + 1}: binary halving guarantees logarithmic depth.`,
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

  const createBaseSession = (
    easyStatus: BatchStatus = BatchStatus.NOT_STARTED,
    mediumStatus: BatchStatus = BatchStatus.LOCKED,
    hardStatus: BatchStatus = BatchStatus.LOCKED,
    easyQuestions: McqQuestionMaskedDTO[] | McqQuestionFullDTO[] = [],
    easyScore: number | null = null,
    easyUserAnswers: number[] = []
  ): TopicSessionDTO => ({
    id: 'session-prc-1',
    _id: 'session-prc-1',
    userId: 'user-789',
    topicQuery: 'Binary Search Trees',
    normalizedTitle: 'Binary Search Trees',
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
        easy: createBatchDTO(
          PracticeTier.EASY,
          easyStatus,
          easyQuestions,
          easyScore,
          easyUserAnswers
        ),
        medium: createBatchDTO(PracticeTier.MEDIUM, mediumStatus),
        hard: createBatchDTO(PracticeTier.HARD, hardStatus),
      },
    },
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z',
  });

  const renderWithStore = (
    session: TopicSessionDTO,
    preloadedOverrides?: Partial<PreloadedRootState>
  ) => {
    const store = createAppStore({
      auth: {
        user: mockUser,
        token: 'mock-valid-jwt-token',
        quota: { used: 2, limit: 50, resetAt: '2026-10-28T00:00:00.000Z' },
        authStatus: 'authenticated',
        error: null,
      },
      session: {
        sessionList: [],
        activeSession: session,
        activeMode: LearningMode.PRACTICE,
        isLoadingList: false,
        isLoadingSession: false,
        isCreatingSession: false,
        error: null,
        streamingState: {
          isStreaming: false,
          streamBuffer: '',
          streamError: null,
          activeTurnId: null,
          activeTurnMessage: null,
        },
        isInitializingExplain: false,
        deepDiveLoadingStep: null,
        explainError: null,
        isInitializingInteract: false,
        interactError: null,
        isGeneratingPractice: false,
        isSubmittingPractice: false,
        practiceError: null,
      },
      ui: {
        isSidebarOpen: true,
        isMobileDrawerOpen: false,
        isProfileModalOpen: false,
        notifications: [],
      },
      ...preloadedOverrides,
    });

    const utils = render(
      <Provider store={store}>
        <MemoryRouter>
          <PracticeStage />
        </MemoryRouter>
      </Provider>
    );

    return { ...utils, store };
  };

  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    apiClient.defaults.adapter = originalAdapter;
    window.localStorage.clear();
  });

  it('AC-PRC-01 & BR-02: auto-generates Easy batch when easy is not_started, and locks Medium & Hard tiers', async () => {
    const initialSession = createBaseSession(BatchStatus.NOT_STARTED, BatchStatus.LOCKED, BatchStatus.LOCKED);

    const generatedSession = createBaseSession(
      BatchStatus.IN_PROGRESS,
      BatchStatus.LOCKED,
      BatchStatus.LOCKED,
      createMockMaskedQuestions(10)
    );

    let generateCalled = false;
    let requestedTier = '';

    apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      if (config.url?.includes('/practice/generate') && config.method === 'post') {
        generateCalled = true;
        const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        requestedTier = body?.tier;
        return {
          data: {
            success: true,
            data: generatedSession,
            meta: { quota: { used: 3, limit: 50, resetAt: '2026-10-28T00:00:00.000Z' } },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      throw new Error(`Unexpected request: ${config.url}`);
    }) as AxiosAdapter;

    renderWithStore(initialSession);

    await waitFor(() => {
      expect(generateCalled).toBe(true);
      expect(requestedTier).toBe(PracticeTier.EASY);
    });

    // Verify Medium and Hard tabs render as locked
    expect(screen.getByTestId('tier-locked-badge-medium')).toBeInTheDocument();
    expect(screen.getByTestId('tier-locked-badge-hard')).toBeInTheDocument();

    const mediumTab = screen.getByRole('tab', { name: /Medium Tier/i });
    expect(mediumTab).toBeDisabled();
    expect(mediumTab).toHaveAttribute('aria-disabled', 'true');
  });

  it('NFR-002: renders progressive loading skeleton feedback when isGeneratingPractice is true', () => {
    const session = createBaseSession(BatchStatus.NOT_STARTED);

    renderWithStore(session, {
      session: {
        sessionList: [],
        activeSession: session,
        activeMode: LearningMode.PRACTICE,
        isLoadingList: false,
        isLoadingSession: false,
        isCreatingSession: false,
        error: null,
        streamingState: {
          isStreaming: false,
          streamBuffer: '',
          streamError: null,
          activeTurnId: null,
          activeTurnMessage: null,
        },
        isInitializingExplain: false,
        deepDiveLoadingStep: null,
        explainError: null,
        isInitializingInteract: false,
        interactError: null,
        isGeneratingPractice: true, // Generating
        isSubmittingPractice: false,
        practiceError: null,
      },
    });

    expect(screen.getByTestId('practice-loading-skeleton')).toBeInTheDocument();
    expect(screen.getByText(/Generating 10 Verified EASY Questions/i)).toBeInTheDocument();
  });

  it('FR-015: renders 10 questions with 4 accessible options each and on-demand hints', async () => {
    const session = createBaseSession(
      BatchStatus.IN_PROGRESS,
      BatchStatus.LOCKED,
      BatchStatus.LOCKED,
      createMockMaskedQuestions(10)
    );

    renderWithStore(session);

    // Verify question 1 renders
    expect(screen.getByTestId('mcq-card-1')).toBeInTheDocument();
    expect(screen.getByText(/Question 1 of 10/i)).toBeInTheDocument();

    // Check hint toggle button
    const hintToggle = screen.getByTestId('hint-toggle-1');
    expect(hintToggle).toHaveTextContent('Show Hint');
    expect(screen.queryByTestId('hint-content-1')).not.toBeInTheDocument();

    // Click Show Hint
    fireEvent.click(hintToggle);
    expect(screen.getByTestId('hint-content-1')).toBeInTheDocument();
    expect(screen.getByText(/look at the tree partitioning/i)).toBeInTheDocument();

    // Click Hide Hint
    fireEvent.click(hintToggle);
    expect(screen.queryByTestId('hint-content-1')).not.toBeInTheDocument();

    // Verify 4 options for Question 1
    expect(screen.getByTestId('mcq-option-1-0')).toBeInTheDocument();
    expect(screen.getByTestId('mcq-option-1-1')).toBeInTheDocument();
    expect(screen.getByTestId('mcq-option-1-2')).toBeInTheDocument();
    expect(screen.getByTestId('mcq-option-1-3')).toBeInTheDocument();
  });

  it('Edge Case 5: selecting options writes immediately to localStorage under mentora_quiz_draft_${sessionId}_${tier} and restores on remount', () => {
    const session = createBaseSession(
      BatchStatus.IN_PROGRESS,
      BatchStatus.LOCKED,
      BatchStatus.LOCKED,
      createMockMaskedQuestions(10)
    );

    const storageKey = getQuizDraftStorageKey(session.id, PracticeTier.EASY);

    // Initial render
    const { unmount } = renderWithStore(session);

    // Select Option B (index 1) for Question 1
    const option1_1 = screen.getByTestId('mcq-option-1-1');
    fireEvent.click(option1_1);

    // Verify written to localStorage
    const stored = window.localStorage.getItem(storageKey);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.sessionId).toBe(session.id);
    expect(parsed.tier).toBe(PracticeTier.EASY);
    expect(parsed.selectedAnswers[0]).toBe(1);

    // Select Option C (index 2) for Question 2
    const option2_2 = screen.getByTestId('mcq-option-2-2');
    fireEvent.click(option2_2);

    const updatedStored = JSON.parse(window.localStorage.getItem(storageKey)!);
    expect(updatedStored.selectedAnswers[1]).toBe(2);

    // Simulate page reload / tab switch by unmounting and re-rendering
    unmount();

    renderWithStore(session);

    // Verify restored options have selected styles / checked attributes
    const rehydratedOpt1_1 = screen.getByTestId('mcq-option-1-1');
    expect(rehydratedOpt1_1).toHaveAttribute('aria-checked', 'true');

    const rehydratedOpt2_2 = screen.getByTestId('mcq-option-2-2');
    expect(rehydratedOpt2_2).toHaveAttribute('aria-checked', 'true');

    expect(screen.getByText(/Answered: 2 \/ 10 Questions/i)).toBeInTheDocument();
  });

  it('Edge Case 5: safely ignores corrupted or invalid JSON in localStorage via Zod validation', () => {
    const session = createBaseSession(
      BatchStatus.IN_PROGRESS,
      BatchStatus.LOCKED,
      BatchStatus.LOCKED,
      createMockMaskedQuestions(10)
    );

    const storageKey = getQuizDraftStorageKey(session.id, PracticeTier.EASY);

    // Seed corrupted JSON
    window.localStorage.setItem(storageKey, '{"corrupted": true, 12345}');

    // Should render gracefully without throwing
    renderWithStore(session);

    expect(screen.getByText(/Answered: 0 \/ 10 Questions/i)).toBeInTheDocument();
  });

  it('BR-03: Submit Batch remains disabled until all 10 questions are answered, and dispatches submit when complete', async () => {
    const session = createBaseSession(
      BatchStatus.IN_PROGRESS,
      BatchStatus.LOCKED,
      BatchStatus.LOCKED,
      createMockMaskedQuestions(10)
    );

    const completedSession = createBaseSession(
      BatchStatus.COMPLETED,
      BatchStatus.NOT_STARTED, // Medium unlocked
      BatchStatus.LOCKED,
      createMockFullQuestions(10),
      9,
      [0, 1, 2, 3, 0, 1, 2, 3, 0, 1]
    );

    const storageKey = getQuizDraftStorageKey(session.id, PracticeTier.EASY);

    // Pre-seed draft with 9 answered questions (index 0..8)
    const partialAnswers = [0, 1, 2, 3, 0, 1, 2, 3, 0, null];
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        sessionId: session.id,
        tier: PracticeTier.EASY,
        selectedAnswers: partialAnswers,
        updatedAt: new Date().toISOString(),
      })
    );

    let submitCalled = false;
    let submittedAnswers: number[] = [];

    apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      if (config.url?.includes('/practice/submit') && config.method === 'post') {
        submitCalled = true;
        const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        submittedAnswers = body?.answers;
        return {
          data: {
            success: true,
            data: completedSession,
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      throw new Error(`Unexpected request: ${config.url}`);
    }) as AxiosAdapter;

    renderWithStore(session);

    // 9 questions answered -> Submit button is disabled
    expect(screen.getByText(/Answered: 9 \/ 10 Questions/i)).toBeInTheDocument();
    const submitBtn = screen.getByTestId('submit-batch-btn');
    expect(submitBtn).toBeDisabled();

    // Answer question 10 (index 9) with Option B (index 1)
    const option10_1 = screen.getByTestId('mcq-option-10-1');
    fireEvent.click(option10_1);

    // Now all 10 questions answered -> Submit button is enabled
    expect(screen.getByText(/Answered: 10 \/ 10 Questions/i)).toBeInTheDocument();
    expect(submitBtn).not.toBeDisabled();

    // Click submit
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(submitCalled).toBe(true);
      expect(submittedAnswers).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1]);
    });

    // Verify localStorage draft is cleared upon successful submission
    expect(window.localStorage.getItem(storageKey)).toBeNull();
  });

  it('AC-PRC-02 & AC-PRC-03: displays Batch Review screen with score banner, choice vs. correct comparisons, explanations, and unlocked Medium CTA', () => {
    // 8 / 10 score: user chose 3 for question 9 (correct was 0), and 3 for question 10 (correct was 1)
    const userAnswers = [0, 1, 2, 3, 0, 1, 2, 3, 3, 3];
    const completedSession = createBaseSession(
      BatchStatus.COMPLETED,
      BatchStatus.NOT_STARTED, // Medium unlocked
      BatchStatus.LOCKED,
      createMockFullQuestions(10),
      8,
      userAnswers
    );

    renderWithStore(completedSession);

    // Verify Batch Score Banner
    expect(screen.getByTestId('batch-score-banner')).toBeInTheDocument();
    expect(screen.getByText(/Batch Score: 8 \/ 10 \(80%\)/i)).toBeInTheDocument();

    // Verify question 1 is marked correct
    expect(screen.getByTestId('review-badge-correct-1')).toBeInTheDocument();
    expect(screen.getByTestId('badge-choice-correct-1')).toBeInTheDocument();

    // Verify question 9 (where user chose index 3 but correct was index 0)
    expect(screen.getByTestId('review-badge-incorrect-9')).toBeInTheDocument();
    expect(screen.getByTestId('badge-choice-incorrect-9')).toBeInTheDocument();
    expect(screen.getByTestId('badge-correct-answer-9')).toBeInTheDocument();

    // Verify step-by-step explanation is visible
    expect(screen.getByTestId('explanation-block-1')).toBeInTheDocument();
    expect(screen.getByText(/Step-by-step derivation for question 1\b/i)).toBeInTheDocument();

    // Verify unlocked Medium CTA button (AC-PRC-03)
    const startMediumBtn = screen.getByTestId('start-next-tier-btn-medium');
    expect(startMediumBtn).toBeInTheDocument();
    expect(startMediumBtn).toHaveTextContent(/Start Medium Batch \(10 Questions\)/i);
  });

  it('renders 30-Question Topic Practice Summary when all three tiers are completed', () => {
    const allCompletedSession: TopicSessionDTO = {
      id: 'session-prc-all',
      _id: 'session-prc-all',
      userId: 'user-789',
      topicQuery: 'Binary Search Trees',
      normalizedTitle: 'Binary Search Trees',
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
        activeTier: PracticeTier.HARD,
        batches: {
          easy: {
            tier: PracticeTier.EASY,
            status: BatchStatus.COMPLETED,
            score: 9,
            questions: createMockFullQuestions(10),
            userAnswers: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1],
            completedAt: '2026-10-28T12:00:00.000Z',
          },
          medium: {
            tier: PracticeTier.MEDIUM,
            status: BatchStatus.COMPLETED,
            score: 8,
            questions: createMockFullQuestions(10),
            userAnswers: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1],
            completedAt: '2026-10-28T12:15:00.000Z',
          },
          hard: {
            tier: PracticeTier.HARD,
            status: BatchStatus.COMPLETED,
            score: 7,
            questions: createMockFullQuestions(10),
            userAnswers: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1],
            completedAt: '2026-10-28T12:30:00.000Z',
          },
        },
      },
      createdAt: '2026-10-27T10:00:00.000Z',
      updatedAt: '2026-10-27T10:00:00.000Z',
    };

    renderWithStore(allCompletedSession);

    // Verify 30-question summary card is rendered
    expect(screen.getByTestId('practice-summary-card')).toBeInTheDocument();
    expect(screen.getByText(/Topic Practice Summary/i)).toBeInTheDocument();

    // Total score 9 + 8 + 7 = 24 / 30 (80%)
    expect(screen.getByTestId('total-score-display')).toHaveTextContent(/24/);
    expect(screen.getByTestId('total-score-display')).toHaveTextContent(/\/ 30/);
    expect(screen.getByTestId('total-score-display')).toHaveTextContent(/80% Overall Accuracy/);
    expect(screen.getByTestId('mastery-level-badge')).toHaveTextContent(/Topic Mastery Achieved/i);

    // Individual tier scores
    expect(screen.getByTestId('tier-score-easy')).toHaveTextContent(/9/);
    expect(screen.getByTestId('tier-score-medium')).toHaveTextContent(/8/);
    expect(screen.getByTestId('tier-score-hard')).toHaveTextContent(/7/);
  });
});
