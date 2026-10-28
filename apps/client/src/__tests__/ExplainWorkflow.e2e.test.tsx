// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AxiosError, type AxiosAdapter } from 'axios';
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
  type SessionSummaryDTO,
  type UserDTO,
  type ExplainCardDTO,
  type DeepDiveSubCardDTO,
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

describe('IMP-018: Frontend End-to-End Explain Mode Workflow & Acceptance Criteria Verification', () => {
  const originalAdapter = apiClient.defaults.adapter;

  const mockUser: UserDTO = {
    id: 'user-turing',
    _id: 'user-turing',
    name: 'Alan Turing',
    email: 'alan@example.com',
    profile: {
      isCompleted: true,
      educationLevel: EducationLevel.UNDERGRADUATE,
      preferredStyle: ExplanationStyle.VISUAL,
    },
    usageQuota: {
      dailyCount: 3,
      dailyLimit: 50,
      windowResetAt: '2026-10-28T00:00:00.000Z',
    },
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z',
  };

  const mockExplainCards: ExplainCardDTO[] = [
    {
      stepNumber: 1,
      stepType: ExplainStepType.INTUITION,
      title: 'Intuition: The Four-Way Traffic Gridlock',
      contentMarkdown:
        'Imagine four vehicles arriving simultaneously at an uncontrolled four-way intersection. Each car waits on the vehicle to its right, causing complete gridlock where no one can proceed.',
      deepDives: [],
    },
    {
      stepNumber: 2,
      stepType: ExplainStepType.CORE_MECHANISM,
      title: "Core Mechanism: Coffman's Four Invariants",
      contentMarkdown:
        'A system deadlock occurs if and only if four necessary conditions hold simultaneously: Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait: $\\forall i, P_i \\rightarrow R_i \\rightarrow P_{(i+1)\\%N}$.',
      deepDives: [],
    },
    {
      stepNumber: 3,
      stepType: ExplainStepType.EXAMPLE,
      title: 'Applied Example: Dining Philosophers Deadlock Scenario',
      contentMarkdown:
        '```typescript\nasync function philosopher(id: number) {\n  await acquireFork(id);\n  await acquireFork((id + 1) % 5);\n  eat();\n}\n```',
      deepDives: [],
    },
    {
      stepNumber: 4,
      stepType: ExplainStepType.CHECK_FOR_UNDERSTANDING,
      title: 'Check-for-Understanding: Breaking Circular Wait',
      contentMarkdown:
        'Reflect on how total ordering of lock acquisition prevents circular wait.',
      checkQuestion:
        'If resources are numbered $1..N$ and all processes must acquire locks in strictly ascending numerical order, can a cycle ever form in the Resource Allocation Graph?',
      checkAnswer:
        'No. Strict monotonic lock acquisition mathematically guarantees that any directed dependency chain is strictly increasing in index, making a closed cycle topologically impossible.',
      deepDives: [],
    },
  ];

  const createInitialSessionDTO = (
    id = 'session-deadlocks',
    topicQuery = 'Deadlocks in Operating Systems'
  ): TopicSessionDTO => ({
    id,
    _id: id,
    userId: mockUser.id,
    topicQuery,
    normalizedTitle: topicQuery,
    lastActiveMode: LearningMode.EXPLAIN,
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
      milestones: [
        {
          milestoneNumber: 1,
          title: 'Resource Allocation Conditions',
          description: 'Identify the four conditions necessary for deadlock.',
          status: MilestoneStatus.PENDING,
        },
      ],
      messages: [],
    },
    practiceState: {
      activeTier: PracticeTier.EASY,
      batches: {
        easy: {
          tier: PracticeTier.EASY,
          status: BatchStatus.LOCKED,
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

  describe('1. Full Interactive Learner Journey (Topic Entry -> Auto-init -> Stepping -> Go Deeper -> CFU -> Mode Switch)', () => {
    it(
      'walks through entering topic, progressive cards reveal, deep-dive expansion, and CFU answer toggle',
      async () => {
      // In-memory mock session state that evolves across requests
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

        // 2. Create session
        if ((url === '/sessions' || url.endsWith('/sessions')) && method === 'POST') {
          const body = JSON.parse(config.data as string);
          activeSessionData = {
            ...activeSessionData,
            topicQuery: body.topicQuery,
            normalizedTitle: body.topicQuery,
          };
          return {
            data: { success: true, data: activeSessionData },
            status: 201,
            statusText: 'Created',
            headers: {},
            config,
          };
        }

        // 3. Auto-initialize Explain cards
        if (url.includes('/explain/init') && method === 'POST') {
          activeSessionData = {
            ...activeSessionData,
            explainState: {
              status: ExplainStatus.READY,
              currentStepIndex: 0,
              cards: mockExplainCards,
              suggestedSubTopics: [
                "Banker's Algorithm",
                'Resource Allocation Graphs',
              ],
            },
          };
          return {
            data: {
              success: true,
              data: activeSessionData,
              meta: {
                quota: { used: 4, limit: 50, resetAt: '2026-10-28T00:00:00.000Z' },
              },
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }

        // 4. Advance step (Next)
        if (url.includes('/explain/step') && method === 'PATCH') {
          const body = JSON.parse(config.data as string);
          activeSessionData = {
            ...activeSessionData,
            explainState: {
              ...activeSessionData.explainState,
              currentStepIndex: body.stepIndex,
            },
          };
          return {
            data: { success: true, data: activeSessionData },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }

        // 5. Go Deeper on Step 2
        if (url.includes('/explain/deeper') && method === 'POST') {
          const body = JSON.parse(config.data as string);
          const deepDive: DeepDiveSubCardDTO = {
            id: 'dd-cycle-proof-1',
            depthLevel: 1,
            title: 'Formal Proof of Cycle Prevention via Partial Order',
            contentMarkdown:
              'Assume a cycle exists: $P_0 \\rightarrow R_1 \\rightarrow P_1 \\rightarrow \\dots \\rightarrow P_0$. Strict order leads to contradiction.',
            createdAt: '2026-10-27T10:05:00.000Z',
          };

          const updatedCards = activeSessionData.explainState.cards.map((c) => {
            if (c.stepNumber === body.stepNumber) {
              return {
                ...c,
                deepDives: [...(c.deepDives || []), deepDive],
              };
            }
            return c;
          });

          activeSessionData = {
            ...activeSessionData,
            explainState: {
              ...activeSessionData.explainState,
              cards: updatedCards,
            },
          };

          return {
            data: {
              success: true,
              data: activeSessionData,
              meta: {
                quota: { used: 5, limit: 50, resetAt: '2026-10-28T00:00:00.000Z' },
              },
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }

        // 6. Switch mode
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
      const { store } = renderWorkspace(['/workspace'], {
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
          activeMode: LearningMode.EXPLAIN,
          isLoadingList: false,
          isLoadingSession: false,
          isCreatingSession: false,
          isInitializingExplain: false,
          deepDiveLoadingStep: null,
          explainError: null,
          error: null,
        },
      });

      // Step A: Topic input hero form is displayed
      expect(
        screen.getByText('What topic would you like to master?')
      ).toBeInTheDocument();

      const textarea = screen.getByLabelText(/Topic or Question/i);
      fireEvent.change(textarea, {
        target: { value: 'Deadlocks in Operating Systems' },
      });

      const startButton = screen.getByRole('button', {
        name: /Start Learning Session/i,
      });
      fireEvent.click(startButton);

      // Step B: Auto-initializes and reveals Step 1 Card (Intuition)
      await waitFor(() => {
        expect(
          screen.getByText(/Intuition: The Four-Way Traffic Gridlock/i)
        ).toBeInTheDocument();
      });

      // Verify Stepper displays Step 1 as current
      const step1Button = screen.getByRole('button', { name: /Step 1: Intuition/i });
      expect(step1Button.closest('li')).toHaveAttribute('aria-current', 'step');

      // Verify Cards 2, 3, 4 are not rendered yet (progressive disclosure AC-EXP-01)
      expect(
        screen.queryByText(/Core Mechanism: Coffman's Four Invariants/i)
      ).not.toBeInTheDocument();

      // Card 1 has Next button and Go Deeper button
      const nextBtn1 = screen.getByRole('button', { name: /Advance to Step 2/i });
      expect(nextBtn1).toBeInTheDocument();

      // Step C: Click Next -> Advance to Step 2 (Core Mechanism) (AC-EXP-02)
      fireEvent.click(nextBtn1);

      await waitFor(() => {
        expect(
          screen.getByText(/Core Mechanism: Coffman's Four Invariants/i)
        ).toBeInTheDocument();
      });

      // Both Step 1 and Step 2 cards are now in the document
      expect(
        screen.getByText(/Intuition: The Four-Way Traffic Gridlock/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Core Mechanism: Coffman's Four Invariants/i)
      ).toBeInTheDocument();

      // Stepper shows Step 2 as current
      const step2Button = screen.getByRole('button', {
        name: /Step 2: Core Mechanism/i,
      });
      expect(step2Button.closest('li')).toHaveAttribute('aria-current', 'step');

      // Step D: Trigger Go Deeper on Step 2 (AC-EXP-03)
      const goDeeperBtns = screen.getAllByRole('button', {
        name: /Go deeper into this step/i,
      });
      // Click Go Deeper on Card 2 (second Go Deeper button)
      fireEvent.click(goDeeperBtns[1]!);

      await waitFor(() => {
        expect(
          screen.getByText(
            'Formal Proof of Cycle Prevention via Partial Order'
          )
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Strict order leads to contradiction/i)
      ).toBeInTheDocument();

      // Step E: Click Next on Card 2 -> Reveal Card 3 (Example)
      const nextBtn2 = screen.getByRole('button', { name: /Advance to Step 3/i });
      fireEvent.click(nextBtn2);

      await waitFor(() => {
        expect(
          screen.getByText(/Applied Example: Dining Philosophers/i)
        ).toBeInTheDocument();
      });

      // Step F: Click Next on Card 3 -> Reveal Card 4 (Check for Understanding)
      const nextBtn3 = screen.getByRole('button', { name: /Advance to Step 4/i });
      fireEvent.click(nextBtn3);

      await waitFor(() => {
        expect(
          screen.getByText(/Check-for-Understanding: Breaking Circular Wait/i)
        ).toBeInTheDocument();
      });

      // Stepper shows Step 4 as current
      const step4Button = screen.getByRole('button', {
        name: /Step 4: Check-for-Understanding/i,
      });
      expect(step4Button.closest('li')).toHaveAttribute('aria-current', 'step');

      // Step G: CFU Question and Answer Toggle
      expect(screen.getByTestId('cfu-section')).toBeInTheDocument();
      expect(
        screen.getByText(/If resources are numbered/i)
      ).toBeInTheDocument();

      // Answer is initially hidden
      expect(screen.queryByTestId('cfu-answer')).not.toBeInTheDocument();

      // Click "Reveal Answer"
      const revealAnswerBtn = screen.getByRole('button', {
        name: /Reveal Answer/i,
      });
      fireEvent.click(revealAnswerBtn);

      expect(screen.getByTestId('cfu-answer')).toBeInTheDocument();
      expect(
        screen.getByText(/Strict monotonic lock acquisition mathematically guarantees/i)
      ).toBeInTheDocument();

      // Click "Hide Answer"
      const hideAnswerBtn = screen.getByRole('button', {
        name: /Hide Answer/i,
      });
      fireEvent.click(hideAnswerBtn);
      expect(screen.queryByTestId('cfu-answer')).not.toBeInTheDocument();

      // Step H: Completion Action CTAs
      expect(
        screen.getByRole('button', { name: /Discuss in Interact Mode/i })
      ).toBeInTheDocument();
      const practiceBtn = screen.getByRole('button', {
        name: /Test Yourself in Practice Mode/i,
      });
      expect(practiceBtn).toBeInTheDocument();

      // Click "Test Yourself in Practice Mode" -> changes active mode to Practice
      fireEvent.click(practiceBtn);

      await waitFor(() => {
        expect(store.getState().session.activeMode).toBe(LearningMode.PRACTICE);
      });
    }, 15000);
  });

  describe('2. History Sidebar Session Navigation & Persistence (FR-006, Journey 3)', () => {
    it('restores saved session with existing currentStepIndex and deep-dives when selected from history', async () => {
      const savedSession: TopicSessionDTO = {
        ...createInitialSessionDTO('session-restored', 'Distributed Raft Consensus'),
        topicQuery: 'Distributed Raft Consensus',
        normalizedTitle: 'Distributed Raft Consensus',
        explainState: {
          status: ExplainStatus.READY,
          currentStepIndex: 1, // Steps 1 and 2 already revealed
          cards: [
            mockExplainCards[0]!,
            {
              ...mockExplainCards[1]!,
              deepDives: [
                {
                  id: 'dd-saved-1',
                  depthLevel: 1,
                  title: 'Restored Leader Invariant Breakdown',
                  contentMarkdown: 'Leader election safety proof.',
                  createdAt: '2026-10-27T10:02:00.000Z',
                },
              ],
            },
            mockExplainCards[2]!,
            mockExplainCards[3]!,
          ],
          suggestedSubTopics: ['Log Replication', 'Safety Invariants'],
        },
      };

      const mockSummary: SessionSummaryDTO = {
        id: 'session-restored',
        _id: 'session-restored',
        topicQuery: 'Distributed Raft Consensus',
        normalizedTitle: 'Distributed Raft Consensus',
        lastActiveMode: LearningMode.EXPLAIN,
        createdAt: '2026-10-27T10:00:00.000Z',
        updatedAt: '2026-10-27T10:30:00.000Z',
      };

      const mockAdapter: AxiosAdapter = async (config) => {
        const url = config.url || '';
        const method = (config.method || 'GET').toUpperCase();

        if ((url === '/sessions' || url.endsWith('/sessions')) && method === 'GET') {
          return {
            data: { success: true, data: [mockSummary] },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
        if (url.includes('/sessions/session-restored') && method === 'GET') {
          return {
            data: { success: true, data: savedSession },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
        return {
          data: { success: true, data: savedSession },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };

      apiClient.defaults.adapter = mockAdapter;

      renderWorkspace(['/workspace'], {
        auth: {
          user: mockUser,
          token: 'mock-jwt-token',
          authStatus: 'authenticated',
          quota: null,
          error: null,
        },
        session: {
          sessionList: [mockSummary],
          activeSession: null,
          activeMode: LearningMode.EXPLAIN,
          isLoadingList: false,
          isLoadingSession: false,
          isCreatingSession: false,
          isInitializingExplain: false,
          deepDiveLoadingStep: null,
          explainError: null,
          error: null,
        },
      });

      // Wait for session summary in sidebar and click it
      await waitFor(() => {
        expect(
          screen.getByText('Distributed Raft Consensus')
        ).toBeInTheDocument();
      });

      const sessionItem = screen.getByText('Distributed Raft Consensus');
      fireEvent.click(sessionItem);

      // Verify restored cards 1 and 2 are visible immediately without calling init
      await waitFor(() => {
        expect(
          screen.getByText(/Intuition: The Four-Way Traffic Gridlock/i)
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Core Mechanism: Coffman's Four Invariants/i)
      ).toBeInTheDocument();

      // Restored deep-dive sub-card is rendered
      expect(
        screen.getByText('Restored Leader Invariant Breakdown')
      ).toBeInTheDocument();

      // Stepper shows Step 2 as current
      const step2Button = screen.getByRole('button', {
        name: /Step 2: Core Mechanism/i,
      });
      expect(step2Button.closest('li')).toHaveAttribute('aria-current', 'step');

      // Card 3 is not yet revealed
      expect(
        screen.queryByText(/Applied Example: Dining Philosophers/i)
      ).not.toBeInTheDocument();
    });
  });

  describe('3. Suggested Sub-Topic Chips Navigation (Edge Case 2)', () => {
    it('dispatches new session creation with subtopic query when user clicks a suggested chip on Card 4', async () => {
      let createdSubTopicQuery = '';

      const readySession: TopicSessionDTO = {
        ...createInitialSessionDTO('session-cfu', 'Deadlocks in Operating Systems'),
        explainState: {
          status: ExplainStatus.READY,
          currentStepIndex: 3, // On Card 4
          cards: mockExplainCards,
          suggestedSubTopics: [
            "Banker's Algorithm",
            'Resource Allocation Graphs',
          ],
        },
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

        if ((url === '/sessions' || url.endsWith('/sessions')) && method === 'POST') {
          const body = JSON.parse(config.data as string);
          createdSubTopicQuery = body.topicQuery;
          return {
            data: {
              success: true,
              data: createInitialSessionDTO('session-new-subtopic', body.topicQuery),
            },
            status: 201,
            statusText: 'Created',
            headers: {},
            config,
          };
        }

        return {
          data: { success: true, data: readySession },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };

      apiClient.defaults.adapter = mockAdapter;

      renderWorkspace(['/workspace/session-cfu'], {
        auth: {
          user: mockUser,
          token: 'mock-jwt-token',
          authStatus: 'authenticated',
          quota: null,
          error: null,
        },
        session: {
          sessionList: [],
          activeSession: readySession,
          activeMode: LearningMode.EXPLAIN,
          isLoadingList: false,
          isLoadingSession: false,
          isCreatingSession: false,
          isInitializingExplain: false,
          deepDiveLoadingStep: null,
          explainError: null,
          error: null,
        },
      });

      // Verify suggested sub-topic chip is displayed
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: "Banker's Algorithm" })
        ).toBeInTheDocument();
      });

      const chip = screen.getByRole('button', { name: "Banker's Algorithm" });
      fireEvent.click(chip);

      // Verify createSessionThunk was dispatched with the sub-topic query
      await waitFor(() => {
        expect(createdSubTopicQuery).toBe("Banker's Algorithm");
      });
    });
  });

  describe('4. Error Handling & Retry on Failed Initialization (Edge Case 4)', () => {
    it('displays error notice and allows user to retry initialization when network error occurs', async () => {
      let initAttemptCount = 0;
      const initialSession = createInitialSessionDTO('session-fail-init');

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

        if (url.includes('/explain/init') && method === 'POST') {
          initAttemptCount += 1;
          if (initAttemptCount === 1) {
            // First attempt fails with 502
            const error = new AxiosError(
              'Gemini API timeout while generating breakdown',
              'ERR_BAD_RESPONSE',
              config,
              null,
              {
                status: 502,
                statusText: 'Bad Gateway',
                headers: {},
                config,
                data: {
                  success: false,
                  error: {
                    code: 'AI_UPSTREAM_FAILURE',
                    message: 'Gemini API timeout while generating breakdown',
                  },
                },
              }
            );
            throw error;
          }

          // Second attempt succeeds
          return {
            data: {
              success: true,
              data: {
                ...initialSession,
                explainState: {
                  status: ExplainStatus.READY,
                  currentStepIndex: 0,
                  cards: mockExplainCards,
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
          data: { success: true, data: initialSession },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };

      apiClient.defaults.adapter = mockAdapter;

      renderWorkspace(['/workspace/session-fail-init'], {
        auth: {
          user: mockUser,
          token: 'mock-jwt-token',
          authStatus: 'authenticated',
          quota: null,
          error: null,
        },
        session: {
          sessionList: [],
          activeSession: initialSession,
          activeMode: LearningMode.EXPLAIN,
          isLoadingList: false,
          isLoadingSession: false,
          isCreatingSession: false,
          isInitializingExplain: false,
          deepDiveLoadingStep: null,
          explainError: null,
          error: null,
        },
      });

      // Error banner is displayed
      await waitFor(() => {
        expect(
          screen.getByRole('alert')
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText('Unable to Complete Explain Mode Action')
      ).toBeInTheDocument();

      expect(
        screen.getByText('Gemini API timeout while generating breakdown')
      ).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', {
        name: /Retry Initialization/i,
      });
      expect(retryBtn).toBeInTheDocument();

      // User clicks retry
      fireEvent.click(retryBtn);

      // Successfully initializes on second attempt
      await waitFor(() => {
        expect(
          screen.getByText(/Intuition: The Four-Way Traffic Gridlock/i)
        ).toBeInTheDocument();
      });

      expect(initAttemptCount).toBe(2);
    });
  });
});
