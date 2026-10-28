// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { type AxiosAdapter } from 'axios';
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
  type SessionSummaryDTO,
  type UserDTO,
  type InteractMilestoneDTO,
  type InteractMessageDTO,
} from '@mentora/shared';
import { apiClient, clearStoredToken } from '../services/apiClient.js';
import { createAppStore, type PreloadedRootState } from '../store/index.js';
import { WorkspacePage } from '../pages/WorkspacePage.js';

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

describe('IMP-021: Frontend End-to-End Interact Mode Workflow & 3-Strike Verification', () => {
  const originalAdapter = apiClient.defaults.adapter;
  const originalFetch = globalThis.fetch;

  const mockUser: UserDTO = {
    id: 'user-lamport',
    _id: 'user-lamport',
    name: 'Leslie Lamport',
    email: 'lamport@example.com',
    profile: {
      isCompleted: true,
      educationLevel: EducationLevel.UNDERGRADUATE,
      preferredStyle: ExplanationStyle.CONCISE_TECHNICAL,
    },
    usageQuota: {
      dailyCount: 4,
      dailyLimit: 50,
      windowResetAt: '2026-10-28T00:00:00.000Z',
    },
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z',
  };

  const mockMilestones: InteractMilestoneDTO[] = [
    {
      milestoneNumber: 1,
      title: 'Leader Election Protocol',
      description: 'Understanding terms, candidate transitions, and split votes.',
      status: MilestoneStatus.ACTIVE,
    },
    {
      milestoneNumber: 2,
      title: 'Log Replication & Consistency',
      description: 'Examining AppendEntries RPC and commit index invariants.',
      status: MilestoneStatus.PENDING,
    },
    {
      milestoneNumber: 3,
      title: 'Safety Invariants & Leader Completeness',
      description: 'Analyzing election restrictions and committed entry preservation.',
      status: MilestoneStatus.PENDING,
    },
  ];

  const mockOpeningMessage: InteractMessageDTO = {
    id: 'msg-init-1',
    role: ChatRole.ASSISTANT,
    content:
      'Welcome to Raft Consensus! What problem arises when two candidate nodes start elections simultaneously in the same term?',
    milestoneNumber: 1,
    strikeNumberAtTurn: 0,
    isCircuitBreakerExplanation: false,
    createdAt: '2026-10-27T10:01:00.000Z',
  };

  const createInitialSessionDTO = (
    id = 'session-int-e2e-1',
    topicQuery = 'Distributed Consensus in Raft'
  ): TopicSessionDTO => ({
    id,
    _id: id,
    userId: 'user-lamport',
    topicQuery,
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
          contentMarkdown: 'Leader election maintains a single source of truth.',
          deepDives: [],
        },
      ],
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
      window.localStorage.setItem('mentora_auth_token', 'mock-jwt-token');
    }
  });

  afterEach(() => {
    cleanup();
    apiClient.defaults.adapter = originalAdapter;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('1. Full Interactive Learner Journey (New Topic -> Auto-init -> Socratic Strikes -> Direct Explanation -> Milestone Advance)', () => {
    it(
      'walks through entering topic in Interact mode, auto-initialization, Socratic turns, escape hatch, and milestone advance',
      async () => {
        let activeSessionData = createInitialSessionDTO();

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

          // 2. Create session (POST /sessions)
          if ((url === '/sessions' || url.endsWith('/sessions')) && method === 'POST') {
            const body = JSON.parse(config.data as string) as {
              topicQuery: string;
              initialMode: LearningMode;
            };
            activeSessionData = {
              ...createInitialSessionDTO('session-int-e2e-1', body.topicQuery),
              lastActiveMode: body.initialMode,
            };
            return {
              data: { success: true, data: activeSessionData },
              status: 201,
              statusText: 'Created',
              headers: {},
              config,
            };
          }

          // 3. Fetch session by ID (GET /sessions/:id)
          if (url.includes('/sessions/session-int-e2e-1') && method === 'GET') {
            return {
              data: { success: true, data: activeSessionData },
              status: 200,
              statusText: 'OK',
              headers: {},
              config,
            };
          }

          // 4. Initialize Interact Mode (POST /sessions/:id/interact/init)
          if (url.includes('/interact/init') && method === 'POST') {
            activeSessionData = {
              ...activeSessionData,
              interactState: {
                status: InteractStatus.ACTIVE,
                activeMilestoneIndex: 0,
                strikeCount: 0,
                milestones: mockMilestones,
                messages: [mockOpeningMessage],
              },
            };
            return {
              data: {
                success: true,
                data: activeSessionData,
                meta: { quota: { used: 5, limit: 50, resetAt: '2026-10-28T00:00:00.000Z' } },
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

        // Mock fetch for SSE streaming turns
        let streamCallCount = 0;
        const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
          streamCallCount += 1;
          const reqBody = JSON.parse(init?.body as string) as {
            message: string;
            forceDirectExplanation?: boolean;
          };

          if (reqBody.forceDirectExplanation) {
            // Manual escape hatch direct explanation
            const cbChunks = [
              'event: start\ndata: {"turnId":"turn-cb-1","activeMilestoneIndex":0}\n\n',
              'event: token\ndata: {"delta":"Direct Explanation: Raft uses randomized timeouts (150-300ms) to ensure one node times out first."}\n\n',
              `event: metadata\ndata: {"activeMilestoneIndex":0,"strikeCount":0,"milestones":[{"milestoneNumber":1,"title":"Leader Election Protocol","description":"D1","status":"active"},{"milestoneNumber":2,"title":"Log Replication & Consistency","description":"D2","status":"pending"},{"milestoneNumber":3,"title":"Safety Invariants & Leader Completeness","description":"D3","status":"pending"}],"isCompleted":false,"assistantMessage":{"id":"asst-cb-1","role":"assistant","content":"Direct Explanation: Raft uses randomized timeouts (150-300ms) to ensure one node times out first.","milestoneNumber":1,"strikeNumberAtTurn":0,"isCircuitBreakerExplanation":true,"createdAt":"2026-10-27T10:03:00.000Z"}}\n\n`,
              'event: done\ndata: [DONE]\n\n',
            ];
            return new Response(createMockSseStream(cbChunks), {
              status: 200,
              headers: { 'Content-Type': 'text/event-stream' },
            });
          }

          if (streamCallCount === 1) {
            // First turn: Struggle response -> Strike 1 Nudge
            const strike1Chunks = [
              'event: start\ndata: {"turnId":"turn-s1","activeMilestoneIndex":0}\n\n',
              'event: token\ndata: {"delta":"Consider what happens when election timers elapse."}\n\n',
              `event: metadata\ndata: {"activeMilestoneIndex":0,"strikeCount":1,"milestones":[{"milestoneNumber":1,"title":"Leader Election Protocol","description":"D1","status":"active"},{"milestoneNumber":2,"title":"Log Replication & Consistency","description":"D2","status":"pending"},{"milestoneNumber":3,"title":"Safety Invariants & Leader Completeness","description":"D3","status":"pending"}],"isCompleted":false,"userMessage":{"id":"user-msg-1","role":"user","content":"They both wait forever.","milestoneNumber":1,"strikeNumberAtTurn":1,"isCircuitBreakerExplanation":false,"createdAt":"2026-10-27T10:02:00.000Z"},"assistantMessage":{"id":"asst-msg-1","role":"assistant","content":"Consider what happens when election timers elapse.","milestoneNumber":1,"strikeNumberAtTurn":1,"isCircuitBreakerExplanation":false,"createdAt":"2026-10-27T10:02:01.000Z"}}\n\n`,
              'event: done\ndata: [DONE]\n\n',
            ];
            return new Response(createMockSseStream(strike1Chunks), {
              status: 200,
              headers: { 'Content-Type': 'text/event-stream' },
            });
          }

          // Milestone advance turn
          const advanceChunks = [
            'event: start\ndata: {"turnId":"turn-adv","activeMilestoneIndex":0}\n\n',
            'event: token\ndata: {"delta":"Mastery achieved! Moving to Log Replication."}\n\n',
            `event: metadata\ndata: {"activeMilestoneIndex":1,"strikeCount":0,"milestones":[{"milestoneNumber":1,"title":"Leader Election Protocol","description":"D1","status":"completed"},{"milestoneNumber":2,"title":"Log Replication & Consistency","description":"D2","status":"active"},{"milestoneNumber":3,"title":"Safety Invariants & Leader Completeness","description":"D3","status":"pending"}],"isCompleted":false,"userMessage":{"id":"user-msg-adv","role":"user","content":"Randomized timeouts ensure one node triggers first.","milestoneNumber":1,"strikeNumberAtTurn":0,"isCircuitBreakerExplanation":false,"createdAt":"2026-10-27T10:04:00.000Z"},"assistantMessage":{"id":"asst-msg-adv","role":"assistant","content":"Mastery achieved! Moving to Log Replication.","milestoneNumber":1,"strikeNumberAtTurn":0,"isCircuitBreakerExplanation":false,"createdAt":"2026-10-27T10:04:01.000Z"}}\n\n`,
            'event: done\ndata: [DONE]\n\n',
          ];
          return new Response(createMockSseStream(advanceChunks), {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        });

        globalThis.fetch = mockFetch;

        // Step A: Mount on /workspace with authenticated user
        renderWorkspace(['/workspace'], {
          auth: {
            user: mockUser,
            token: 'mock-jwt-token',
            authStatus: 'authenticated',
            quota: null,
            error: null,
          },
          session: {
            sessionList: [],
            activeSession: null,
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
            },
            isInitializingExplain: false,
            deepDiveLoadingStep: null,
            explainError: null,
            isInitializingInteract: false,
            interactError: null,
          },
        });

        // Step B: Submit New Topic with Interact Mode selected
        const topicInput = screen.getByPlaceholderText(
          /e\.g\. Distributed Consensus/i
        );
        fireEvent.change(topicInput, {
          target: { value: 'Distributed Consensus in Raft' },
        });

        // Select Interact Mode option card
        const interactCard = screen.getByText('Interact Mode').closest('div[role="radio"]');
        expect(interactCard).toBeInTheDocument();
        fireEvent.click(interactCard!);

        const submitBtn = screen.getByRole('button', {
          name: /Start Learning Session/i,
        });
        fireEvent.click(submitBtn);

        // Step C: Verify Navigation to /workspace/:sessionId & Auto-initialization
        await waitFor(() => {
          expect(screen.getByTestId('interact-stage')).toBeInTheDocument();
          expect(screen.getByText('Conceptual Milestones')).toBeInTheDocument();
        });

        // Milestones rendered with Milestone 1 active
        expect(screen.getByTestId('milestone-active-1')).toBeInTheDocument();
        expect(
          screen.getAllByText('Leader Election Protocol').length
        ).toBeGreaterThanOrEqual(1);

        // Opening diagnostic question rendered
        expect(
          screen.getByText(/What problem arises when two candidate nodes start elections/i)
        ).toBeInTheDocument();

        // Step D: User types message -> Socratic Nudge (Strike 1)
        const textarea = screen.getByTestId('chat-input-textarea');
        fireEvent.change(textarea, { target: { value: 'They both wait forever.' } });
        fireEvent.click(screen.getByTestId('chat-send-button'));

        await waitFor(() => {
          expect(
            screen.getByText(/Consider what happens when election timers elapse/i)
          ).toBeInTheDocument();
        });

        // Strike 1 badge rendered in Milestone Tracker
        expect(screen.getByTestId('strike-indicator')).toHaveTextContent(
          /Socratic Nudge Active \(Strike 1\/3\)/i
        );

        // Step E: Click "Explain this milestone directly" (Escape Hatch, FR-013)
        const directBtn = screen.getByTestId('explain-directly-button');
        fireEvent.click(directBtn);

        await waitFor(() => {
          expect(
            screen.getByText(/Direct Explanation: Raft uses randomized timeouts/i)
          ).toBeInTheDocument();
        });

        // Circuit Breaker banner is rendered on assistant bubble
        expect(screen.getByTestId('circuit-breaker-banner')).toHaveTextContent(
          /Direct explanation provided after guided Socratic review/i
        );

        // Step F: Milestone Advance Turn
        fireEvent.change(textarea, {
          target: { value: 'Randomized timeouts ensure one node triggers first.' },
        });
        fireEvent.click(screen.getByTestId('chat-send-button'));

        await waitFor(() => {
          expect(
            screen.getByText(/Mastery achieved! Moving to Log Replication/i)
          ).toBeInTheDocument();
        });

        // Milestone 1 marked completed with checkmark, Milestone 2 is active
        expect(screen.getByTestId('milestone-completed-1')).toBeInTheDocument();
        expect(screen.getByTestId('milestone-active-2')).toBeInTheDocument();
      },
      15000
    );
  });

  describe('2. History Sidebar Session Navigation & Persistence (FR-006, Journey 3)', () => {
    it('restores saved session with past chat messages and milestone statuses when loaded from history', async () => {
      const savedSession: TopicSessionDTO = {
        ...createInitialSessionDTO('session-history-2', 'Byzantine Fault Tolerance'),
        topicQuery: 'Byzantine Fault Tolerance',
        normalizedTitle: 'Byzantine Fault Tolerance',
        interactState: {
          status: InteractStatus.ACTIVE,
          activeMilestoneIndex: 1,
          strikeCount: 1,
          milestones: [
            {
              milestoneNumber: 1,
              title: 'Byzantine Generals Problem',
              description: 'Understanding oral message assumptions.',
              status: MilestoneStatus.COMPLETED,
            },
            {
              milestoneNumber: 2,
              title: '3m + 1 Node Bound',
              description: 'Deriving why 3m+1 nodes are required.',
              status: MilestoneStatus.ACTIVE,
            },
          ],
          messages: [
            mockOpeningMessage,
            {
              id: 'u-1',
              role: ChatRole.USER,
              content: 'Traitorous generals can lie to peers.',
              milestoneNumber: 1,
              strikeNumberAtTurn: 0,
              isCircuitBreakerExplanation: false,
              createdAt: '2026-10-27T10:02:00.000Z',
            },
            {
              id: 'a-1',
              role: ChatRole.ASSISTANT,
              content: 'Exactly! Now consider how many total generals are required.',
              milestoneNumber: 2,
              strikeNumberAtTurn: 1,
              isCircuitBreakerExplanation: false,
              createdAt: '2026-10-27T10:03:00.000Z',
            },
          ],
        },
      };

      const mockSummary: SessionSummaryDTO = {
        id: savedSession.id,
        _id: savedSession._id,
        topicQuery: savedSession.topicQuery,
        normalizedTitle: savedSession.normalizedTitle,
        lastActiveMode: LearningMode.INTERACT,
        createdAt: savedSession.createdAt,
        updatedAt: savedSession.updatedAt,
      };

      const mockAdapter: AxiosAdapter = async (config) => {
        const url = config.url || '';
        const method = (config.method || 'GET').toUpperCase();

        if (url.includes('/sessions/session-history-2') && method === 'GET') {
          return {
            data: { success: true, data: savedSession },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }

        return {
          data: { success: true, data: [mockSummary] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };

      apiClient.defaults.adapter = mockAdapter;

      renderWorkspace(['/workspace/session-history-2'], {
        auth: {
          user: mockUser,
          token: 'mock-jwt-token',
          authStatus: 'authenticated',
          quota: null,
          error: null,
        },
        session: {
          sessionList: [mockSummary],
          activeSession: savedSession,
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
          },
          isInitializingExplain: false,
          deepDiveLoadingStep: null,
          explainError: null,
          isInitializingInteract: false,
          interactError: null,
        },
      });

      // Verify restored session rendered
      await waitFor(() => {
        expect(screen.getByTestId('interact-stage')).toBeInTheDocument();
      });

      // Milestone 1 completed, Milestone 2 active
      expect(screen.getByTestId('milestone-completed-1')).toBeInTheDocument();
      expect(screen.getByTestId('milestone-active-2')).toBeInTheDocument();

      // Strike indicator for Milestone 2
      expect(screen.getByTestId('strike-indicator')).toHaveTextContent(
        /Socratic Nudge Active \(Strike 1\/3\)/i
      );

      // Historical messages rendered
      expect(screen.getByText('Traitorous generals can lie to peers.')).toBeInTheDocument();
      expect(
        screen.getByText('Exactly! Now consider how many total generals are required.')
      ).toBeInTheDocument();
    });
  });

  describe('3. Network Interruption & Retry Recovery (Edge Case 4)', () => {
    it('renders "Connection interrupted — Retry" on network drop and allows clean retry', async () => {
      const activeSession = createInitialSessionDTO('session-retry', 'Distributed Commit');
      activeSession.interactState = {
        status: InteractStatus.ACTIVE,
        activeMilestoneIndex: 0,
        strikeCount: 0,
        milestones: mockMilestones,
        messages: [mockOpeningMessage],
      };

      const mockAdapter: AxiosAdapter = async (config) => ({
        data: { success: true, data: activeSession },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

      apiClient.defaults.adapter = mockAdapter;

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error('Connection reset by peer');
        }

        const recoveryChunks = [
          'event: start\ndata: {"turnId":"turn-rec","activeMilestoneIndex":0}\n\n',
          'event: token\ndata: {"delta":"Recovered response after connection drop."}\n\n',
          `event: metadata\ndata: {"activeMilestoneIndex":0,"strikeCount":0,"milestones":[],"isCompleted":false,"assistantMessage":{"id":"asst-rec","role":"assistant","content":"Recovered response after connection drop.","milestoneNumber":1,"strikeNumberAtTurn":0,"isCircuitBreakerExplanation":false,"createdAt":"2026-10-27T10:05:00.000Z"}}\n\n`,
          'event: done\ndata: [DONE]\n\n',
        ];
        return new Response(createMockSseStream(recoveryChunks), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      });

      globalThis.fetch = mockFetch;

      renderWorkspace(['/workspace/session-retry'], {
        auth: {
          user: mockUser,
          token: 'mock-jwt-token',
          authStatus: 'authenticated',
          quota: null,
          error: null,
        },
        session: {
          sessionList: [],
          activeSession,
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
          },
          isInitializingExplain: false,
          deepDiveLoadingStep: null,
          explainError: null,
          isInitializingInteract: false,
          interactError: null,
        },
      });

      await waitFor(() => {
        expect(screen.getByTestId('interact-stage')).toBeInTheDocument();
      });

      // Submit message
      const textarea = screen.getByTestId('chat-input-textarea');
      fireEvent.change(textarea, { target: { value: 'Query on 2PC' } });
      fireEvent.click(screen.getByTestId('chat-send-button'));

      // Wait for error banner
      await waitFor(() => {
        expect(screen.getByTestId('stream-error-banner')).toBeInTheDocument();
      });

      // Click Retry
      const retryBtn = screen.getByRole('button', {
        name: /Connection interrupted — Retry/i,
      });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(callCount).toBe(2);
      });

      await waitFor(() => {
        expect(
          screen.getByText('Recovered response after connection drop.')
        ).toBeInTheDocument();
      });
    });
  });
});
