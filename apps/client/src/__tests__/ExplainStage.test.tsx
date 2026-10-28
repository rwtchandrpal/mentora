// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import '@testing-library/jest-dom/vitest';
import {
  EducationLevel,
  ExplanationStyle,
  LearningMode,
  ExplainStatus,
  ExplainStepType,
  InteractStatus,
  MilestoneStatus,
  PracticeTier,
  BatchStatus,
  type TopicSessionDTO,
  type UserDTO,
  type ExplainCardDTO,
} from '@mentora/shared';
import { apiClient } from '../services/apiClient.js';
import { createAppStore, type RootState } from '../store/index.js';
import { ExplainStage } from '../components/explain/ExplainStage.js';

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

describe('IMP-017: Frontend Explain Mode Stage, Stepper, & Go Deeper UI', () => {
  const originalAdapter = apiClient.defaults.adapter;

  const mockUser: UserDTO = {
    id: 'user-789',
    _id: 'user-789',
    name: 'Alan Turing',
    email: 'alan@example.com',
    profile: {
      isCompleted: true,
      educationLevel: EducationLevel.UNDERGRADUATE,
      preferredStyle: ExplanationStyle.VISUAL,
    },
    usageQuota: {
      dailyCount: 5,
      dailyLimit: 50,
      windowResetAt: '2026-10-28T00:00:00.000Z',
    },
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z',
  };

  const mock4Cards: ExplainCardDTO[] = [
    {
      stepNumber: 1,
      stepType: ExplainStepType.INTUITION,
      title: 'Intuition: The Classroom Election',
      contentMarkdown: 'Think of Raft as a classroom electing a single class representative.',
      deepDives: [],
    },
    {
      stepNumber: 2,
      stepType: ExplainStepType.CORE_MECHANISM,
      title: 'Core Mechanism: Terms and Invariants',
      contentMarkdown: 'Leader election uses terms numbered monotonically. Mathematical safety: $\\forall t, |L_t| \\le 1$.',
      deepDives: [],
    },
    {
      stepNumber: 3,
      stepType: ExplainStepType.EXAMPLE,
      title: 'Applied Example: Heartbeats and Election Timeouts',
      contentMarkdown: '```python\ndef elect_leader(nodes):\n    return nodes[0]\n```',
      deepDives: [],
    },
    {
      stepNumber: 4,
      stepType: ExplainStepType.CHECK_FOR_UNDERSTANDING,
      title: 'Check-for-Understanding: Conceptual Reflection',
      contentMarkdown: 'Let us test your understanding of split votes and randomized timeouts.',
      checkQuestion: 'What happens when two candidate nodes split votes evenly in term $T$?',
      checkAnswer: 'Neither candidate achieves a majority, the election times out, and a new election starts with randomized timeouts in term $T+1$.',
      deepDives: [],
    },
  ];

  const createBaseSession = (
    currentStepIndex = 0,
    status: ExplainStatus = ExplainStatus.READY,
    cards: ExplainCardDTO[] = mock4Cards,
    suggestedSubTopics: string[] = []
  ): TopicSessionDTO => ({
    id: 'session-exp-1',
    _id: 'session-exp-1',
    userId: 'user-789',
    topicQuery: 'Distributed Consensus in Raft',
    normalizedTitle: 'Raft Consensus Algorithm',
    lastActiveMode: LearningMode.EXPLAIN,
    explainState: {
      status,
      currentStepIndex,
      cards,
      suggestedSubTopics,
    },
    interactState: {
      status: InteractStatus.NOT_STARTED,
      activeMilestoneIndex: 0,
      strikeCount: 0,
      milestones: [
        {
          milestoneNumber: 1,
          title: 'Foundations of Consensus',
          description: 'Explore state machine replication',
          status: MilestoneStatus.ACTIVE,
        },
      ],
      messages: [],
    },
    practiceState: {
      activeTier: PracticeTier.EASY,
      batches: {
        [PracticeTier.EASY]: {
          tier: PracticeTier.EASY,
          status: BatchStatus.NOT_STARTED,
          score: null,
          questions: [],
          userAnswers: [],
          completedAt: null,
        },
        [PracticeTier.MEDIUM]: {
          tier: PracticeTier.MEDIUM,
          status: BatchStatus.LOCKED,
          score: null,
          questions: [],
          userAnswers: [],
          completedAt: null,
        },
        [PracticeTier.HARD]: {
          tier: PracticeTier.HARD,
          status: BatchStatus.LOCKED,
          score: null,
          questions: [],
          userAnswers: [],
          completedAt: null,
        },
      },
    },
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z',
  });

  const renderComponent = (preloadedState?: Partial<RootState>) => {
    const store = createAppStore(preloadedState);
    const view = render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/workspace/session-exp-1']}>
          <ExplainStage />
        </MemoryRouter>
      </Provider>
    );
    return { store, ...view };
  };

  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    cleanup();
  });

  // 1. Initial Progressive Disclosure (AC-EXP-01)
  it('AC-EXP-01: renders ONLY Card 1 (Intuition) when currentStepIndex === 0, omitting Cards 2, 3, and 4 from DOM', () => {
    const session = createBaseSession(0);

    renderComponent({
      auth: {
        token: 'token',
        user: mockUser,
        quota: null,
        authStatus: 'authenticated',
        error: null,
      },
      session: {
        sessionList: [],
        activeSession: session,
        activeMode: LearningMode.EXPLAIN,
        isLoadingList: false,
        isLoadingSession: false,
        isCreatingSession: false,
        error: null,
        streamingState: {
          isStreaming: false,
          streamBuffer: '',
          streamError: null,
          activeTurnId: null,
        },
        isInitializingExplain: false,
        deepDiveLoadingStep: null,
        explainError: null,
      },
    });

    // Card 1 is rendered
    expect(screen.getByTestId('explain-card-1')).toBeInTheDocument();
    expect(
      screen.getByText('Intuition: The Classroom Election')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Think of Raft as a classroom electing/i)
    ).toBeInTheDocument();

    // Cards 2, 3, and 4 are NOT rendered in the DOM
    expect(screen.queryByTestId('explain-card-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('explain-card-3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('explain-card-4')).not.toBeInTheDocument();

    // StepProgressBar indicates step 1 is active (aria-current="step")
    const step1 = screen.getByLabelText(/Step 1: Intuition \(Active\)/i);
    expect(step1).toBeInTheDocument();
  });

  // 2. Sequential Stepping via Next (AC-EXP-02)
  it('AC-EXP-02: advances sequentially through Next button from Card 1 to 2, 2 to 3, and 3 to 4', async () => {
    let currentStep = 0;
    const session = createBaseSession(0);

    const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      if (
        config.url?.includes('/explain/step') &&
        config.method?.toLowerCase() === 'patch'
      ) {
        const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        currentStep = body.stepIndex;
        const updated = {
          ...session,
          explainState: {
            ...session.explainState,
            currentStepIndex: currentStep,
          },
        };
        return {
          data: { success: true, data: updated },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      return {
        data: { success: true, data: session },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    apiClient.defaults.adapter = mockAdapter;

    renderComponent({
      auth: {
        token: 'token',
        user: mockUser,
        quota: null,
        authStatus: 'authenticated',
        error: null,
      },
      session: {
        sessionList: [],
        activeSession: session,
        activeMode: LearningMode.EXPLAIN,
        isLoadingList: false,
        isLoadingSession: false,
        isCreatingSession: false,
        error: null,
        streamingState: {
          isStreaming: false,
          streamBuffer: '',
          streamError: null,
          activeTurnId: null,
        },
        isInitializingExplain: false,
        deepDiveLoadingStep: null,
        explainError: null,
      },
    });

    // Step 1: Click Next on Card 1
    const nextBtn1 = screen.getByRole('button', {
      name: /advance to step 2/i,
    });
    fireEvent.click(nextBtn1);

    // Card 2 is now revealed
    await waitFor(() => {
      expect(screen.getByTestId('explain-card-2')).toBeInTheDocument();
    });
    expect(
      screen.getByText('Core Mechanism: Terms and Invariants')
    ).toBeInTheDocument();
    // Cards 3 and 4 are still not rendered
    expect(screen.queryByTestId('explain-card-3')).not.toBeInTheDocument();

    // Step 2: Click Next on Card 2
    const nextBtn2 = screen.getByRole('button', {
      name: /advance to step 3/i,
    });
    fireEvent.click(nextBtn2);

    // Card 3 is now revealed
    await waitFor(() => {
      expect(screen.getByTestId('explain-card-3')).toBeInTheDocument();
    });
    expect(
      screen.getByText('Applied Example: Heartbeats and Election Timeouts')
    ).toBeInTheDocument();

    // Step 3: Click Next on Card 3
    const nextBtn3 = screen.getByRole('button', {
      name: /advance to step 4/i,
    });
    fireEvent.click(nextBtn3);

    // Card 4 is now revealed
    await waitFor(() => {
      expect(screen.getByTestId('explain-card-4')).toBeInTheDocument();
    });
    expect(
      screen.getByText('Check-for-Understanding: Conceptual Reflection')
    ).toBeInTheDocument();

    // On Card 4, Next button is no longer rendered
    expect(
      screen.queryByRole('button', { name: /advance to step 5/i })
    ).not.toBeInTheDocument();
  });

  // 3. On-Demand Depth via Go Deeper (AC-EXP-03)
  it('AC-EXP-03: clicking Go Deeper generates and appends DeepDiveSubCard directly beneath the card without resetting currentStepIndex', async () => {
    const session = createBaseSession(0);
    const mockDeepDive = {
      id: 'subcard-99',
      depthLevel: 1,
      title: 'Formal Safety Invariant Proof',
      contentMarkdown: 'Every term has at most one leader by majority pigeonhole principle.',
      createdAt: '2026-10-28T12:00:00.000Z',
    };

    let deeperCalled = false;
    let receivedStepNumber = 0;

    const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      if (
        config.url?.includes('/explain/deeper') &&
        config.method?.toLowerCase() === 'post'
      ) {
        deeperCalled = true;
        const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        receivedStepNumber = body.stepNumber;

        const updatedCards = session.explainState.cards.map((c) =>
          c.stepNumber === 1
            ? { ...c, deepDives: [...c.deepDives, mockDeepDive] }
            : c
        );

        const updated: TopicSessionDTO = {
          ...session,
          explainState: {
            ...session.explainState,
            cards: updatedCards,
            currentStepIndex: 0, // Preserves currentStepIndex
          },
        };

        return {
          data: {
            success: true,
            data: updated,
            meta: {
              quota: {
                used: 6,
                limit: 50,
                resetAt: '2026-10-28T00:00:00.000Z',
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
        data: { success: true, data: session },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    apiClient.defaults.adapter = mockAdapter;

    const { store } = renderComponent({
      auth: {
        token: 'token',
        user: mockUser,
        quota: null,
        authStatus: 'authenticated',
        error: null,
      },
      session: {
        sessionList: [],
        activeSession: session,
        activeMode: LearningMode.EXPLAIN,
        isLoadingList: false,
        isLoadingSession: false,
        isCreatingSession: false,
        error: null,
        streamingState: {
          isStreaming: false,
          streamBuffer: '',
          streamError: null,
          activeTurnId: null,
        },
        isInitializingExplain: false,
        deepDiveLoadingStep: null,
        explainError: null,
      },
    });

    // Click Go Deeper on Card 1
    const goDeeperBtn = screen.getByRole('button', {
      name: /go deeper into this step/i,
    });
    fireEvent.click(goDeeperBtn);

    // Verify sub-card is rendered
    await waitFor(() => {
      expect(
        screen.getByTestId('deep-dive-card-subcard-99')
      ).toBeInTheDocument();
    });

    expect(deeperCalled).toBe(true);
    expect(receivedStepNumber).toBe(1);
    expect(screen.getByText('Formal Safety Invariant Proof')).toBeInTheDocument();
    expect(
      screen.getByText(/Every term has at most one leader/i)
    ).toBeInTheDocument();

    // Verify currentStepIndex is still 0 (Card 2 is still not rendered)
    expect(store.getState().session.activeSession?.explainState.currentStepIndex).toBe(0);
    expect(screen.queryByTestId('explain-card-2')).not.toBeInTheDocument();

    // Quota was updated in auth slice
    expect(store.getState().auth.quota?.used).toBe(6);
  });

  // 4. Check-for-Understanding Answer Reveal & Mode Switch CTAs
  it('Check-for-Understanding: toggles answer reveal and triggers mode switch CTAs on Card 4', async () => {
    // Session at step index 3 (Card 4 revealed)
    const session = createBaseSession(3);

    let switchedMode: LearningMode | null = null;
    const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      if (
        config.url?.includes('/mode') &&
        config.method?.toLowerCase() === 'patch'
      ) {
        const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        switchedMode = body.mode;
        return {
          data: {
            success: true,
            data: { lastActiveMode: body.mode },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      return {
        data: { success: true, data: session },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    apiClient.defaults.adapter = mockAdapter;

    const { store } = renderComponent({
      auth: {
        token: 'token',
        user: mockUser,
        quota: null,
        authStatus: 'authenticated',
        error: null,
      },
      session: {
        sessionList: [],
        activeSession: session,
        activeMode: LearningMode.EXPLAIN,
        isLoadingList: false,
        isLoadingSession: false,
        isCreatingSession: false,
        error: null,
        streamingState: {
          isStreaming: false,
          streamBuffer: '',
          streamError: null,
          activeTurnId: null,
        },
        isInitializingExplain: false,
        deepDiveLoadingStep: null,
        explainError: null,
      },
    });

    // Card 4 and CFU section are visible
    expect(screen.getByTestId('explain-card-4')).toBeInTheDocument();
    expect(screen.getByTestId('cfu-section')).toBeInTheDocument();

    // Question is rendered
    expect(
      screen.getByText(/What happens when two candidate nodes split votes evenly/i)
    ).toBeInTheDocument();

    // Answer is hidden initially
    expect(screen.queryByTestId('cfu-answer')).not.toBeInTheDocument();

    // Click "Reveal Answer"
    const revealBtn = screen.getByRole('button', { name: /reveal answer/i });
    fireEvent.click(revealBtn);

    // Answer is now visible
    expect(screen.getByTestId('cfu-answer')).toBeInTheDocument();
    expect(
      screen.getByText(/Neither candidate achieves a majority/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hide answer/i })).toBeInTheDocument();

    // Click "Hide Answer"
    fireEvent.click(screen.getByRole('button', { name: /hide answer/i }));
    expect(screen.queryByTestId('cfu-answer')).not.toBeInTheDocument();

    // Mode Switch CTA 1: Discuss in Interact Mode
    const interactCta = screen.getByRole('button', {
      name: /discuss in interact mode/i,
    });
    fireEvent.click(interactCta);

    await waitFor(() => {
      expect(switchedMode).toBe(LearningMode.INTERACT);
    });
    expect(store.getState().session.activeMode).toBe(LearningMode.INTERACT);

    // Mode Switch CTA 2: Test Yourself in Practice Mode
    const practiceCta = screen.getByRole('button', {
      name: /test yourself in practice mode/i,
    });
    fireEvent.click(practiceCta);

    await waitFor(() => {
      expect(switchedMode).toBe(LearningMode.PRACTICE);
    });
    expect(store.getState().session.activeMode).toBe(LearningMode.PRACTICE);
  });

  // 5. Auto-Initialization & Progressive Loading Skeleton (NFR-002)
  it('NFR-002: auto-triggers /explain/init and displays skeleton loader when explainState.status === not_started', async () => {
    let initCalled = false;
    const uninitializedSession = createBaseSession(
      0,
      ExplainStatus.NOT_STARTED,
      []
    );

    const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      if (
        config.url?.includes('/explain/init') &&
        config.method?.toLowerCase() === 'post'
      ) {
        initCalled = true;
        const initializedSession = createBaseSession(0, ExplainStatus.READY);
        return {
          data: {
            success: true,
            data: initializedSession,
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      return {
        data: { success: true, data: uninitializedSession },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    apiClient.defaults.adapter = mockAdapter;

    renderComponent({
      auth: {
        token: 'token',
        user: mockUser,
        quota: null,
        authStatus: 'authenticated',
        error: null,
      },
      session: {
        sessionList: [],
        activeSession: uninitializedSession,
        activeMode: LearningMode.EXPLAIN,
        isLoadingList: false,
        isLoadingSession: false,
        isCreatingSession: false,
        error: null,
        streamingState: {
          isStreaming: false,
          streamBuffer: '',
          streamError: null,
          activeTurnId: null,
        },
        isInitializingExplain: false,
        deepDiveLoadingStep: null,
        explainError: null,
      },
    });

    // Skeleton loader with informative text
    expect(screen.getByTestId('explain-stage-loading')).toBeInTheDocument();
    expect(
      screen.getByText(/Breaking down topic into 4 progressive learning cards/i)
    ).toBeInTheDocument();

    // Verified init was automatically dispatched
    await waitFor(() => {
      expect(initCalled).toBe(true);
    });

    // Once initialized, Card 1 appears and skeleton is replaced
    await waitFor(() => {
      expect(screen.getByTestId('explain-card-1')).toBeInTheDocument();
    });
  });

  // 6. Broad-Topic Sub-Topic Chips (Edge Case 2)
  it('Edge Case 2: renders clickable sub-topic chips on Card 4 when topic is broad and suggests sub-topics', async () => {
    const subTopics = [
      'Raft Log Replication',
      'Cluster Membership Changes',
      'Log Compaction and Snapshots',
    ];
    const session = createBaseSession(3, ExplainStatus.READY, mock4Cards, subTopics);

    let sessionCreatedTopic: string | null = null;
    const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      if (
        config.url === '/sessions' &&
        config.method?.toLowerCase() === 'post'
      ) {
        const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        sessionCreatedTopic = body.topicQuery;
        const newSession = {
          ...createBaseSession(0),
          id: 'session-new-subtopic',
          topicQuery: body.topicQuery,
        };
        return {
          data: {
            success: true,
            data: newSession,
          },
          status: 201,
          statusText: 'Created',
          headers: {},
          config,
        };
      }
      return {
        data: { success: true, data: session },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    apiClient.defaults.adapter = mockAdapter;

    renderComponent({
      auth: {
        token: 'token',
        user: mockUser,
        quota: null,
        authStatus: 'authenticated',
        error: null,
      },
      session: {
        sessionList: [],
        activeSession: session,
        activeMode: LearningMode.EXPLAIN,
        isLoadingList: false,
        isLoadingSession: false,
        isCreatingSession: false,
        error: null,
        streamingState: {
          isStreaming: false,
          streamBuffer: '',
          streamError: null,
          activeTurnId: null,
        },
        isInitializingExplain: false,
        deepDiveLoadingStep: null,
        explainError: null,
      },
    });

    // Verify sub-topic chips appear
    expect(screen.getByText('Explore Focused Sub-Topics:')).toBeInTheDocument();
    const chip = screen.getByRole('button', { name: /Raft Log Replication/i });
    expect(chip).toBeInTheDocument();

    // Click sub-topic chip
    fireEvent.click(chip);

    await waitFor(() => {
      expect(sessionCreatedTopic).toBe('Raft Log Replication');
    });
  });

  // 7. Educational Guardrail Refusal & Error Alert (Edge Case 1)
  it('Edge Case 1: renders educational guardrail refusal alert when AI refuses non-educational prompt', async () => {
    const session = createBaseSession(0);

    const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      if (config.url?.includes('/explain/init')) {
        throw new AxiosError(
          'Request failed with status code 422',
          'ERR_BAD_REQUEST',
          config,
          {},
          {
            status: 422,
            statusText: 'Unprocessable Entity',
            headers: {},
            config,
            data: {
              success: false,
              error: {
                code: 'EDUCATIONAL_GUARDRAIL_REFUSAL',
                message:
                  'Mentora is dedicated exclusively to academic and educational concepts. Please rephrase your query.',
              },
            },
          }
        );
      }
      return {
        data: { success: true, data: session },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    apiClient.defaults.adapter = mockAdapter;

    const uninitializedSession = createBaseSession(
      0,
      ExplainStatus.NOT_STARTED,
      []
    );

    renderComponent({
      auth: {
        token: 'token',
        user: mockUser,
        quota: null,
        authStatus: 'authenticated',
        error: null,
      },
      session: {
        sessionList: [],
        activeSession: uninitializedSession,
        activeMode: LearningMode.EXPLAIN,
        isLoadingList: false,
        isLoadingSession: false,
        isCreatingSession: false,
        error: null,
        streamingState: {
          isStreaming: false,
          streamBuffer: '',
          streamError: null,
          activeTurnId: null,
        },
        isInitializingExplain: false,
        deepDiveLoadingStep: null,
        explainError: null,
      },
    });

    // Refusal notice appears
    await waitFor(() => {
      expect(
        screen.getByText('Educational Scope Guardrail Notice')
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Mentora is dedicated exclusively to academic/i)
    ).toBeInTheDocument();

    // Dismiss button dismisses the alert
    const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(
        screen.queryByText('Educational Scope Guardrail Notice')
      ).not.toBeInTheDocument();
    });
  });
});
