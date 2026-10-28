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
  ChatRole,
  PracticeTier,
  BatchStatus,
  type TopicSessionDTO,
  type UserDTO,
  type InteractMilestoneDTO,
  type InteractMessageDTO,
} from '@mentora/shared';
import { apiClient } from '../services/apiClient.js';
import { createAppStore, type PreloadedRootState } from '../store/index.js';
import { InteractStage } from '../components/interact/InteractStage.js';

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

describe('IMP-020: Frontend SSE Client Hook (useSseStream) & Interact Mode UI Stage', () => {
  const originalAdapter = apiClient.defaults.adapter;
  const originalFetch = globalThis.fetch;

  const mockUser: UserDTO = {
    id: 'user-789',
    _id: 'user-789',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    profile: {
      isCompleted: true,
      educationLevel: EducationLevel.UNDERGRADUATE,
      preferredStyle: ExplanationStyle.CONCISE_TECHNICAL,
    },
    usageQuota: {
      dailyCount: 5,
      dailyLimit: 50,
      windowResetAt: '2026-10-28T00:00:00.000Z',
    },
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z',
  };

  const mockMilestones: InteractMilestoneDTO[] = [
    {
      milestoneNumber: 1,
      title: 'Leader Election & Heartbeats',
      description: 'Understanding terms, candidate transitions, and majority quorums.',
      status: MilestoneStatus.ACTIVE,
    },
    {
      milestoneNumber: 2,
      title: 'Log Replication & Consistency',
      description: 'Examining append entries RPCs and commit indices.',
      status: MilestoneStatus.PENDING,
    },
    {
      milestoneNumber: 3,
      title: 'Safety Invariants & Leader Completeness',
      description: 'Analyzing election restriction and committed entry preservation.',
      status: MilestoneStatus.PENDING,
    },
  ];

  const mockOpeningMessage: InteractMessageDTO = {
    id: 'msg-init-1',
    role: ChatRole.ASSISTANT,
    content:
      "Welcome to Raft Consensus! To begin our exploration of Leader Election, what triggers a follower node to transition into a candidate state?",
    milestoneNumber: 1,
    strikeNumberAtTurn: 0,
    isCircuitBreakerExplanation: false,
    createdAt: '2026-10-27T10:05:00.000Z',
  };

  const createBaseSession = (
    interactStatus: InteractStatus = InteractStatus.ACTIVE,
    milestones: InteractMilestoneDTO[] = mockMilestones,
    messages: InteractMessageDTO[] = [mockOpeningMessage],
    activeMilestoneIndex = 0,
    strikeCount = 0
  ): TopicSessionDTO => ({
    id: 'session-int-1',
    _id: 'session-int-1',
    userId: 'user-789',
    topicQuery: 'Distributed Consensus in Raft',
    normalizedTitle: 'Raft Consensus Protocol',
    lastActiveMode: LearningMode.INTERACT,
    explainState: {
      status: ExplainStatus.READY,
      currentStepIndex: 0,
      cards: [
        {
          stepNumber: 1,
          stepType: ExplainStepType.INTUITION,
          title: 'Intuition of Raft',
          contentMarkdown: 'Leader election maintains order.',
          deepDives: [],
        },
      ],
      suggestedSubTopics: [],
    },
    interactState: {
      status: interactStatus,
      activeMilestoneIndex,
      strikeCount,
      milestones,
      messages,
    },
    practiceState: {
      activeTier: PracticeTier.EASY,
      batches: {
        easy: {
          tier: PracticeTier.EASY,
          status: BatchStatus.NOT_STARTED,
          score: null,
          questions: [],
          userAnswers: [],
          completedAt: null,
        },
        medium: {
          tier: PracticeTier.MEDIUM,
          status: BatchStatus.LOCKED,
          score: null,
          questions: [],
          userAnswers: [],
          completedAt: null,
        },
        hard: {
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

  const renderStage = (preloadedSession?: TopicSessionDTO, preloadedState?: PreloadedRootState) => {
    const session = preloadedSession ?? createBaseSession();
    const store = createAppStore({
      auth: {
        user: mockUser,
        token: 'mock-jwt-token',
        quota: { used: 5, limit: 50, resetAt: '2026-10-28T00:00:00.000Z' },
        authStatus: 'authenticated',
        error: null,
      },
      session: {
        sessionList: [
          {
            id: session.id,
            _id: session._id,
            topicQuery: session.topicQuery,
            normalizedTitle: session.normalizedTitle,
            lastActiveMode: session.lastActiveMode,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          },
        ],
        activeSession: session,
        activeMode: LearningMode.INTERACT,
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
        ...preloadedState?.session,
      },
      ...preloadedState,
    });

    const utils = render(
      <Provider store={store}>
        <MemoryRouter>
          <InteractStage />
        </MemoryRouter>
      </Provider>
    );

    return { ...utils, store };
  };

  const createMockSseStream = (chunks: string[]) => {
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });
  };

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.setItem('mentora_auth_token', 'mock-jwt-token');
    // Default scrollIntoView mock for jsdom
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    globalThis.fetch = originalFetch;
    cleanup();
  });

  // 1. Auto-Initialization Test (AC-INT-01)
  it('AC-INT-01: auto-initializes milestones and opening diagnostic question when status is not_started', async () => {
    let initCallCount = 0;
    const initializedSession = createBaseSession(
      InteractStatus.ACTIVE,
      mockMilestones,
      [mockOpeningMessage],
      0,
      0
    );

    const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      if (config.url?.includes('/interact/init') && config.method === 'post') {
        initCallCount += 1;
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            success: true,
            data: initializedSession,
            meta: {
              quota: { used: 6, limit: 50, resetAt: '2026-10-28T00:00:00.000Z' },
            },
          },
        };
      }

      throw new AxiosError(`Unhandled ${config.method} ${config.url}`, 'ERR_UNHANDLED');
    };

    apiClient.defaults.adapter = mockAdapter;

    // Create session in not_started state
    const uninitializedSession = createBaseSession(
      InteractStatus.NOT_STARTED,
      [],
      [],
      0,
      0
    );

    const { store } = renderStage(uninitializedSession);

    // Verify skeleton or loading indicator is rendered during initialization
    await waitFor(() => {
      expect(initCallCount).toBe(1);
    });

    // After resolution, verify milestones and opening message are displayed
    await waitFor(() => {
      expect(screen.getByTestId('interact-stage')).toBeInTheDocument();
      expect(screen.getByText('Conceptual Milestones')).toBeInTheDocument();
      expect(
        screen.getAllByText('Leader Election & Heartbeats').length
      ).toBeGreaterThanOrEqual(1);
      expect(
        screen.getByText(/what triggers a follower node to transition/i)
      ).toBeInTheDocument();
    });

    // Verify quota updated in Redux auth slice
    expect(store.getState().auth.quota?.used).toBe(6);
  });

  // 2. Milestone Progress Tracker Display & Statuses (AC-INT-03)
  it('AC-INT-03: renders 3-5 milestones with completed checkmarks, active indicator, and strike hint badges', () => {
    const customMilestones: InteractMilestoneDTO[] = [
      {
        milestoneNumber: 1,
        title: 'Leader Election',
        description: 'Completed milestone 1.',
        status: MilestoneStatus.COMPLETED,
      },
      {
        milestoneNumber: 2,
        title: 'Log Replication',
        description: 'Active milestone 2 with 1 strike.',
        status: MilestoneStatus.ACTIVE,
      },
      {
        milestoneNumber: 3,
        title: 'Safety Invariants',
        description: 'Pending milestone 3.',
        status: MilestoneStatus.PENDING,
      },
    ];

    const sessionWithStrikes = createBaseSession(
      InteractStatus.ACTIVE,
      customMilestones,
      [mockOpeningMessage],
      1,
      1 // Strike 1: Socratic Nudge
    );

    renderStage(sessionWithStrikes);

    // Verify completed checkmark on Milestone 1
    expect(screen.getByTestId('milestone-completed-1')).toBeInTheDocument();

    // Verify active pulse badge on Milestone 2
    expect(screen.getByTestId('milestone-active-2')).toBeInTheDocument();

    // Verify Socratic Nudge badge for strikeCount = 1
    expect(screen.getByTestId('strike-indicator')).toHaveTextContent(
      /Socratic Nudge Active \(Strike 1\/3\)/i
    );

    // Verify completed counter badge
    expect(screen.getByText('1 of 3 Completed')).toBeInTheDocument();
  });

  // 3. Concrete Hint Strike 2 Badge
  it('displays Strike 2 (Concrete Hint) indicator badge when strikeCount is 2', () => {
    const sessionWithStrike2 = createBaseSession(
      InteractStatus.ACTIVE,
      mockMilestones,
      [mockOpeningMessage],
      0,
      2 // Strike 2
    );

    renderStage(sessionWithStrike2);

    expect(screen.getByTestId('strike-indicator')).toHaveTextContent(
      /Concrete Hint Active \(Strike 2\/3\)/i
    );
  });

  // 4. Message Submission & Token Streaming (FR-011, NFR-001)
  it('FR-011: streams assistant tokens via SSE and updates chat transcript and milestones', async () => {
    let capturedBody: string | undefined;

    const sseChunks = [
      'event: start\ndata: {"turnId":"turn-101","activeMilestoneIndex":0}\n\n',
      'event: token\ndata: {"delta":"Precisely! An election timeout fires "}\n\n',
      'event: token\ndata: {"delta":"when heartbeats from the leader cease."}\n\n',
      `event: metadata\ndata: {"activeMilestoneIndex":1,"strikeCount":0,"milestones":[{"milestoneNumber":1,"title":"Leader Election & Heartbeats","description":"D1","status":"completed"},{"milestoneNumber":2,"title":"Log Replication & Consistency","description":"D2","status":"active"},{"milestoneNumber":3,"title":"Safety Invariants & Leader Completeness","description":"D3","status":"pending"}],"isCompleted":false,"userMessage":{"id":"user-m-1","role":"user","content":"When heartbeats stop after an election timeout","milestoneNumber":1,"strikeNumberAtTurn":0,"isCircuitBreakerExplanation":false,"createdAt":"2026-10-27T10:06:00.000Z"},"assistantMessage":{"id":"asst-m-1","role":"assistant","content":"Precisely! An election timeout fires when heartbeats from the leader cease.","milestoneNumber":1,"strikeNumberAtTurn":0,"isCircuitBreakerExplanation":false,"createdAt":"2026-10-27T10:06:01.000Z"},"quota":{"used":7,"limit":50,"resetAt":"2026-10-28T00:00:00.000Z"}}\n\n`,
      'event: done\ndata: [DONE]\n\n',
    ];

    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(createMockSseStream(sseChunks), {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
        },
      });
    });

    globalThis.fetch = mockFetch;

    renderStage();

    // Find chat input textarea
    const textarea = screen.getByTestId('chat-input-textarea');
    fireEvent.change(textarea, {
      target: { value: 'When heartbeats stop after an election timeout' },
    });

    // Character counter should update
    expect(screen.getByTestId('char-counter')).toHaveTextContent(/46 \/ 2000/);

    // Submit form via Send button
    const sendButton = screen.getByTestId('chat-send-button');
    expect(sendButton).not.toBeDisabled();
    fireEvent.click(sendButton);

    // Verify fetch was called with correct endpoint and payload
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    expect(mockFetch.mock.calls[0]?.[0]).toContain('/sessions/session-int-1/interact/stream');
    const parsedBody = JSON.parse(capturedBody || '{}') as {
      message: string;
      forceDirectExplanation: boolean;
    };
    expect(parsedBody.message).toBe('When heartbeats stop after an election timeout');
    expect(parsedBody.forceDirectExplanation).toBe(false);

    // Verify assistant's completed message is displayed in transcript
    await waitFor(() => {
      expect(
        screen.getByText(/Precisely! An election timeout fires when heartbeats/i)
      ).toBeInTheDocument();
    });

    // Verify Milestone 1 advanced to completed
    await waitFor(() => {
      expect(screen.getByTestId('milestone-completed-1')).toBeInTheDocument();
      expect(screen.getByTestId('milestone-active-2')).toBeInTheDocument();
    });
  });

  // 5. Direct Explanation Escape Hatch (FR-013, AC-INT-02)
  it('FR-013: clicking "Explain this milestone directly" sends forceDirectExplanation: true and renders Circuit Breaker banner', async () => {
    let capturedBody: string | undefined;

    const sseChunks = [
      'event: start\ndata: {"turnId":"turn-cb-1","activeMilestoneIndex":0}\n\n',
      'event: token\ndata: {"delta":"Here is the direct explanation: A follower increments its term..."}\n\n',
      `event: metadata\ndata: {"activeMilestoneIndex":0,"strikeCount":0,"milestones":[{"milestoneNumber":1,"title":"Leader Election & Heartbeats","description":"D1","status":"active"},{"milestoneNumber":2,"title":"Log Replication & Consistency","description":"D2","status":"pending"},{"milestoneNumber":3,"title":"Safety Invariants & Leader Completeness","description":"D3","status":"pending"}],"isCompleted":false,"assistantMessage":{"id":"asst-cb-1","role":"assistant","content":"Here is the direct explanation: A follower increments its term...","milestoneNumber":1,"strikeNumberAtTurn":0,"isCircuitBreakerExplanation":true,"createdAt":"2026-10-27T10:07:00.000Z"}}\n\n`,
      'event: done\ndata: [DONE]\n\n',
    ];

    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(createMockSseStream(sseChunks), {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
        },
      });
    });

    globalThis.fetch = mockFetch;

    renderStage();

    const directButton = screen.getByTestId('explain-directly-button');
    fireEvent.click(directButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const parsedBody = JSON.parse(capturedBody || '{}') as {
      message: string;
      forceDirectExplanation: boolean;
    };
    expect(parsedBody.forceDirectExplanation).toBe(true);

    // Verify Circuit Breaker badge appears on the assistant bubble
    await waitFor(() => {
      expect(screen.getByTestId('circuit-breaker-banner')).toHaveTextContent(
        /Direct explanation provided after guided Socratic review/i
      );
    });
  });

  // 6. Network Drop & Retry Recovery (Edge Case 4)
  it('Edge Case 4: displays "Connection interrupted — Retry" on network drop and allows clean retry without penalizing strikes', async () => {
    let callCount = 0;

    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        // First attempt fails with network error
        throw new Error('Failed to fetch');
      }

      // Retry attempt succeeds
      const recoveryChunks = [
        'event: start\ndata: {"turnId":"turn-rec","activeMilestoneIndex":0}\n\n',
        'event: token\ndata: {"delta":"Recovered response after network drop."}\n\n',
        'event: metadata\ndata: {"activeMilestoneIndex":0,"strikeCount":0,"milestones":[],"isCompleted":false,"assistantMessage":{"id":"asst-rec","role":"assistant","content":"Recovered response after network drop.","milestoneNumber":1,"strikeNumberAtTurn":0,"isCircuitBreakerExplanation":false,"createdAt":"2026-10-27T10:08:00.000Z"}}\n\n',
        'event: done\ndata: [DONE]\n\n',
      ];
      return new Response(createMockSseStream(recoveryChunks), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });

    globalThis.fetch = mockFetch;

    renderStage();

    // Type and send a message
    const textarea = screen.getByTestId('chat-input-textarea');
    fireEvent.change(textarea, { target: { value: 'My candidate query' } });
    fireEvent.click(screen.getByTestId('chat-send-button'));

    // Wait for stream error banner with retry button
    await waitFor(() => {
      expect(screen.getByTestId('stream-error-banner')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Connection interrupted — Retry/i })
      ).toBeInTheDocument();
    });

    // In-flight user message is still preserved in transcript
    expect(screen.getByTestId('chat-message-user-inflight')).toBeInTheDocument();

    // Click Retry
    const retryButton = screen.getByRole('button', {
      name: /Connection interrupted — Retry/i,
    });
    fireEvent.click(retryButton);

    // Second call should succeed
    await waitFor(() => {
      expect(callCount).toBe(2);
    });

    await waitFor(() => {
      expect(screen.getByText('Recovered response after network drop.')).toBeInTheDocument();
    });
  });

  // 7. All Milestones Mastered Completion Banner & Mode Switch CTA
  it('displays completion banner and Practice Mode CTA when all milestones are completed', () => {
    const allCompletedMilestones: InteractMilestoneDTO[] = mockMilestones.map((m) => ({
      ...m,
      status: MilestoneStatus.COMPLETED,
    }));

    const completedSession = createBaseSession(
      InteractStatus.COMPLETED,
      allCompletedMilestones,
      [mockOpeningMessage],
      2,
      0
    );

    renderStage(completedSession);

    // Verify milestone completed badge
    expect(screen.getByTestId('milestones-completed-badge')).toBeInTheDocument();
    expect(screen.getByTestId('interact-completed-banner')).toBeInTheDocument();

    // Chat input textarea should be disabled
    expect(screen.getByTestId('chat-input-textarea')).toBeDisabled();
    expect(screen.getByTestId('explain-directly-button')).toBeDisabled();

    // CTAs should be present
    expect(
      screen.getByRole('button', { name: /Review Explain Cards/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Start Practice MCQs/i })
    ).toBeInTheDocument();
  });
});
