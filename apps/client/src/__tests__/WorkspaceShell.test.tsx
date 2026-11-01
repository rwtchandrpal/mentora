// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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
  type SessionSummaryDTO,
  type UserDTO,
  type QuotaMetaDTO,
} from '@mentora/shared';
import { apiClient, clearStoredToken } from '../services/apiClient.js';
import { createAppStore, type PreloadedRootState } from '../store/index.js';
import { WorkspacePage } from '../pages/WorkspacePage.js';

describe('IMP-012: Unified Workspace Shell, Left History Sidebar, & Mode Switcher Tabs', () => {
  const originalAdapter = apiClient.defaults.adapter;

  const mockUser: UserDTO = {
    id: 'user-456',
    _id: 'user-456',
    name: 'Grace Hopper',
    email: 'grace@example.com',
    profile: {
      isCompleted: true,
      educationLevel: EducationLevel.PROFESSIONAL,
      preferredStyle: ExplanationStyle.VISUAL,
    },
    usageQuota: {
      dailyCount: 15,
      dailyLimit: 50,
      windowResetAt: '2026-10-28T00:00:00.000Z',
    },
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z',
  };

  const mockQuotaMeta: QuotaMetaDTO = {
    used: 16,
    limit: 50,
    resetAt: '2026-10-28T00:00:00.000Z',
  };

  const mockSummary1: SessionSummaryDTO = {
    id: 'session-101',
    _id: 'session-101',
    topicQuery: 'Distributed Consensus in Raft',
    normalizedTitle: 'Raft Consensus Algorithm',
    lastActiveMode: LearningMode.EXPLAIN,
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T11:00:00.000Z',
  };

  const mockSummary2: SessionSummaryDTO = {
    id: 'session-102',
    _id: 'session-102',
    topicQuery: 'Eigenvalues & Eigenvectors',
    normalizedTitle: 'Eigenvalues and Eigenvectors',
    lastActiveMode: LearningMode.INTERACT,
    createdAt: '2026-10-27T09:00:00.000Z',
    updatedAt: '2026-10-27T09:30:00.000Z',
  };

  const mockActiveSession: TopicSessionDTO = {
    id: 'session-101',
    _id: 'session-101',
    userId: 'user-456',
    topicQuery: 'Distributed Consensus in Raft',
    normalizedTitle: 'Raft Consensus Algorithm',
    lastActiveMode: LearningMode.EXPLAIN,
    explainState: {
      status: ExplainStatus.READY,
      currentStepIndex: 1,
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
      status: InteractStatus.ACTIVE,
      activeMilestoneIndex: 0,
      strikeCount: 0,
      milestones: [
        {
          milestoneNumber: 1,
          title: 'Leader Election Protocol',
          description: 'Understanding split votes and randomized timeouts.',
          status: MilestoneStatus.ACTIVE,
        },
      ],
      messages: [],
    },
    practiceState: {
      activeTier: PracticeTier.EASY,
      batches: {
        easy: {
          tier: PracticeTier.EASY,
          status: BatchStatus.IN_PROGRESS,
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
    updatedAt: '2026-10-27T11:00:00.000Z',
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
      window.localStorage.clear();
    }
    const defaultMockAdapter: AxiosAdapter = async (config) => {
      return {
        data: { success: true, data: [] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    apiClient.defaults.adapter = defaultMockAdapter;
  });

  afterEach(() => {
    cleanup();
    apiClient.defaults.adapter = originalAdapter;
    clearStoredToken();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. New Topic Input & Creation (FR-004)
  // =========================================================================
  describe('1. New Topic Input & Creation Stage (FR-004)', () => {
    it('renders New Topic Input stage when activeSession is null with character counter and mode selectors', () => {
      renderWorkspace(['/workspace'], {
        auth: {
          token: 'mock-token',
          user: mockUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
        session: {
          sessionList: [mockSummary1],
          activeSession: null,
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
        },
      });

      // Verification: New Topic form elements
      expect(
        screen.getByRole('heading', {
          name: /what topic would you like to master\?/i,
        })
      ).toBeInTheDocument();

      const textarea = screen.getByLabelText(/topic or question/i);
      expect(textarea).toBeInTheDocument();
      expect(screen.getByText('0 / 300')).toBeInTheDocument();
      expect(screen.getByText('Select Mode')).toBeInTheDocument();
      expect(screen.queryByText(/Enter any academic theory/i)).not.toBeInTheDocument();

      expect(screen.getByRole('radio', { name: /explain mode/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /interact mode/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /practice mode/i })).toBeInTheDocument();

      // Submit button is initially disabled
      expect(
        screen.getByRole('button', { name: /start learning session/i })
      ).toBeDisabled();
    });

    it('submits valid topic query with initial mode and switches workspace to active session stage', async () => {
      let postSessionsCalled = false;
      let sentPayload: unknown = null;

      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        if (config.url === '/sessions' && config.method === 'post') {
          postSessionsCalled = true;
          sentPayload = JSON.parse(config.data as string);
          return {
            data: {
              success: true,
              data: mockActiveSession,
              meta: { quota: mockQuotaMeta },
            },
            status: 201,
            statusText: 'Created',
            headers: {},
            config,
          };
        }
        if (config.url === '/sessions' && config.method === 'get') {
          return {
            data: {
              success: true,
              data: [mockSummary1],
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
        return {
          data: { success: false },
          status: 404,
          statusText: 'Not Found',
          headers: {},
          config,
        };
      };
      apiClient.defaults.adapter = mockAdapter;

      const { store } = renderWorkspace(['/workspace'], {
        auth: {
          token: 'mock-token',
          user: mockUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
      });

      const textarea = screen.getByLabelText(/topic or question/i);
      fireEvent.change(textarea, {
        target: { value: 'Distributed Consensus in Raft' },
      });
      expect(screen.getByText('29 / 300')).toBeInTheDocument();

      // Select Interact Mode radio card
      fireEvent.click(screen.getByRole('radio', { name: /interact mode/i }));

      // Click submit
      const submitBtn = screen.getByRole('button', { name: /start learning session/i });
      expect(submitBtn).toBeEnabled();
      fireEvent.submit(submitBtn.closest('form')!);

      // Wait for session creation and UI state switch
      await waitFor(() => {
        expect(postSessionsCalled).toBe(true);
      });

      expect(sentPayload).toEqual({
        topicQuery: 'Distributed Consensus in Raft',
        initialMode: LearningMode.INTERACT,
      });

      // Verify active session title in header and placeholder stage
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /raft consensus algorithm/i })
        ).toBeInTheDocument();
      });

      expect(store.getState().session.activeSession?.id).toBe('session-101');
    });

    it('displays educational scope refusal banner when non-educational topic is refused (Edge Case 2)', async () => {
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        if (config.url === '/sessions' && config.method === 'post') {
          throw new AxiosError(
            'Educational refusal',
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
                    'Mentora is calibrated exclusively for educational learning concepts. Please provide an academic or technical subject.',
                },
              },
            }
          );
        }
        return {
          data: { success: true, data: [] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };
      apiClient.defaults.adapter = mockAdapter;

      renderWorkspace(['/workspace'], {
        auth: {
          token: 'mock-token',
          user: mockUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
      });

      const textarea = screen.getByLabelText(/topic or question/i);
      fireEvent.change(textarea, { target: { value: 'tell me a non-educational joke' } });

      const submitBtn = screen.getByRole('button', { name: /start learning session/i });
      fireEvent.submit(submitBtn.closest('form')!);

      // Wait for educational guardrail refusal alert
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(
          screen.getByText(/educational scope guardrail notice/i)
        ).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 2. Mode Switcher Tabs Continuity (FR-005)
  // =========================================================================
  describe('2. Mode Switcher Tabs Continuity (FR-005)', () => {
    it('switches between Explain, Interact, and Practice modes and updates lastActiveMode via PATCH /sessions/:id/mode', async () => {
      let patchModeCalled = false;
      let patchedMode: unknown = null;

      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        if (config.url === `/sessions/${mockActiveSession.id}/mode` && config.method === 'patch') {
          patchModeCalled = true;
          patchedMode = JSON.parse(config.data as string).mode;
          return {
            data: {
              success: true,
              data: { lastActiveMode: patchedMode as LearningMode },
              meta: { quota: mockQuotaMeta },
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
        return {
          data: { success: true, data: [mockSummary1] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };
      apiClient.defaults.adapter = mockAdapter;

      const { store } = renderWorkspace(['/workspace/session-101'], {
        auth: {
          token: 'mock-token',
          user: mockUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
        session: {
          sessionList: [mockSummary1],
          activeSession: { ...mockActiveSession },
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
        },
      });

      // Verify Explain stage is rendered
      expect(screen.getByTestId('explain-stage')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Explain Mode' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.queryByText('4 Cards')).not.toBeInTheDocument();
      expect(screen.queryByText('Socratic')).not.toBeInTheDocument();
      expect(screen.queryByText('10 MCQs')).not.toBeInTheDocument();

      // Click Interact Tab
      const interactTab = screen.getByRole('tab', { name: 'Interact Mode' });
      fireEvent.click(interactTab);

      // Verify mode switched to Interact
      await waitFor(() => {
        expect(screen.getByTestId('interact-stage')).toBeInTheDocument();
      });
      expect(interactTab).toHaveAttribute('aria-selected', 'true');
      expect(patchModeCalled).toBe(true);
      expect(patchedMode).toBe(LearningMode.INTERACT);
      expect(store.getState().session.activeMode).toBe(LearningMode.INTERACT);

      // Click Practice Tab
      const practiceTab = screen.getByRole('tab', { name: /practice/i });
      fireEvent.click(practiceTab);

      // Verify mode switched to Practice
      await waitFor(() => {
        expect(screen.getByTestId('practice-stage-placeholder')).toBeInTheDocument();
      });
      expect(practiceTab).toHaveAttribute('aria-selected', 'true');
      expect(store.getState().session.activeMode).toBe(LearningMode.PRACTICE);
    });

    it('supports keyboard navigation across mode tabs with arrow keys', () => {
      const { store } = renderWorkspace(['/workspace/session-101'], {
        auth: {
          token: 'mock-token',
          user: mockUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
        session: {
          sessionList: [mockSummary1],
          activeSession: { ...mockActiveSession },
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
        },
      });

      const explainTab = screen.getByRole('tab', { name: /explain/i });
      // Press ArrowRight to move to Interact
      fireEvent.keyDown(explainTab, { key: 'ArrowRight' });
      expect(store.getState().session.activeMode).toBe(LearningMode.INTERACT);

      // Press ArrowRight to move to Practice
      const interactTab = screen.getByRole('tab', { name: /interact/i });
      fireEvent.keyDown(interactTab, { key: 'ArrowRight' });
      expect(store.getState().session.activeMode).toBe(LearningMode.PRACTICE);

      // Press ArrowLeft to move back to Interact
      const practiceTab = screen.getByRole('tab', { name: /practice/i });
      fireEvent.keyDown(practiceTab, { key: 'ArrowLeft' });
      expect(store.getState().session.activeMode).toBe(LearningMode.INTERACT);
    });
  });

  // =========================================================================
  // 3. Left History Sidebar Management (FR-006)
  // =========================================================================
  describe('3. Left History Sidebar Management (FR-006)', () => {
    it('lists past sessions, highlights active session, and loads session on click', async () => {
      let getSessionCalled = false;
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        if (config.url === `/sessions/${mockSummary2.id}`) {
          getSessionCalled = true;
          return {
            data: {
              success: true,
              data: {
                ...mockActiveSession,
                id: mockSummary2.id,
                normalizedTitle: mockSummary2.normalizedTitle,
                lastActiveMode: LearningMode.INTERACT,
              },
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
        return {
          data: { success: true, data: [mockSummary1, mockSummary2] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };
      apiClient.defaults.adapter = mockAdapter;

      renderWorkspace(['/workspace'], {
        auth: {
          token: 'mock-token',
          user: mockUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
        session: {
          sessionList: [mockSummary1, mockSummary2],
          activeSession: null,
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
        },
      });

      // Verify both sessions are listed in the sidebar
      expect(screen.getByText('Raft Consensus Algorithm')).toBeInTheDocument();
      expect(screen.getByText('Eigenvalues and Eigenvectors')).toBeInTheDocument();

      // Click on Eigenvalues session
      fireEvent.click(screen.getByText('Eigenvalues and Eigenvectors'));

      await waitFor(() => {
        expect(getSessionCalled).toBe(true);
      });
    });

    it('confirms and deletes session when trash icon is clicked', async () => {
      let deleteSessionCalled = false;
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        if (config.url === `/sessions/${mockSummary1.id}` && config.method === 'delete') {
          deleteSessionCalled = true;
          return {
            data: { success: true, data: { deleted: true } },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
        return {
          data: { success: true, data: [mockSummary1] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };
      apiClient.defaults.adapter = mockAdapter;

      const { store } = renderWorkspace(['/workspace'], {
        auth: {
          token: 'mock-token',
          user: mockUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
        session: {
          sessionList: [mockSummary1],
          activeSession: { ...mockActiveSession },
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
        },
      });

      // Click trash icon for session 1
      const deleteBtn = screen.getByLabelText(`Delete session ${mockSummary1.normalizedTitle}`);
      fireEvent.click(deleteBtn);

      // Confirmation buttons appear
      const confirmBtn = screen.getByLabelText(`Confirm delete ${mockSummary1.normalizedTitle}`);
      expect(confirmBtn).toBeInTheDocument();

      // Click Yes
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(deleteSessionCalled).toBe(true);
      });

      // Session is removed and active session cleared
      expect(store.getState().session.sessionList).toHaveLength(0);
      expect(store.getState().session.activeSession).toBeNull();
    });

    it('clears active session and returns to New Topic stage when New Topic button is clicked', () => {
      const { store } = renderWorkspace(['/workspace/session-101'], {
        auth: {
          token: 'mock-token',
          user: mockUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
        session: {
          sessionList: [mockSummary1],
          activeSession: { ...mockActiveSession },
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
        },
      });

      // Verify active session view is displayed
      expect(screen.getByRole('heading', { name: /raft consensus algorithm/i })).toBeInTheDocument();

      // Click "New Topic" button in sidebar
      fireEvent.click(screen.getByRole('button', { name: /new topic/i }));

      // Workspace switches to New Topic stage
      expect(store.getState().session.activeSession).toBeNull();
      expect(
        screen.getByRole('heading', { name: /what topic would you like to master\?/i })
      ).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 4. Daily AI Usage Quota Badge (BR-04)
  // =========================================================================
  describe('4. Daily Quota Badge Display (BR-04)', () => {
    it('displays remaining daily AI actions when quota is available', () => {
      renderWorkspace(['/workspace'], {
        auth: {
          token: 'mock-token',
          user: mockUser,
          quota: {
            used: 15,
            limit: 50,
            resetAt: '2026-10-28T00:00:00.000Z',
          },
          authStatus: 'authenticated',
          error: null,
        },
      });

      // Remaining: 50 - 15 = 35 left
      expect(screen.getByText('35 / 50 left')).toBeInTheDocument();
      expect(screen.getByText('15 used today')).toBeInTheDocument();
    });

    it('displays polite warning badge when daily quota is exhausted (50/50)', () => {
      renderWorkspace(['/workspace'], {
        auth: {
          token: 'mock-token',
          user: mockUser,
          quota: {
            used: 50,
            limit: 50,
            resetAt: '2026-10-28T00:00:00.000Z',
          },
          authStatus: 'authenticated',
          error: null,
        },
      });

      expect(screen.getByText('Daily Quota Reached')).toBeInTheDocument();
      expect(
        screen.getByText(/you've used all 50 ai actions today\./i)
      ).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 5. Desktop & Mobile Sidebar Toggles (NFR-004)
  // =========================================================================
  describe('5. Responsive Sidebar Toggles (NFR-004)', () => {
    it('toggles desktop sidebar state with dynamic arrow direction and correct aria attributes', () => {
      const { store } = renderWorkspace(['/workspace'], {
        auth: {
          token: 'mock-token',
          user: mockUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
        session: {
          sessionList: [mockSummary1],
          activeSession: { ...mockActiveSession },
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
        },
      });

      expect(store.getState().ui.isSidebarOpen).toBe(true);

      // 1. When open: collapse button is in top-left with aria-expanded="true" and left arrow
      const collapseBtn = screen.getByLabelText(/collapse sidebar/i);
      expect(collapseBtn).toBeInTheDocument();
      expect(collapseBtn).toHaveAttribute('aria-expanded', 'true');
      const leftArrow = collapseBtn.querySelector('svg path');
      expect(leftArrow).toHaveAttribute('d', 'M15 19l-7-7 7-7');

      // Click desktop collapse button
      fireEvent.click(collapseBtn);

      expect(store.getState().ui.isSidebarOpen).toBe(false);

      // 2. When collapsed: expand button is displayed with aria-expanded="false" and right arrow
      const expandBtn = screen.getByLabelText(/expand sidebar/i);
      expect(expandBtn).toBeInTheDocument();
      expect(expandBtn).toHaveAttribute('aria-expanded', 'false');
      const rightArrow = expandBtn.querySelector('svg path');
      expect(rightArrow).toHaveAttribute('d', 'M9 5l7 7-7 7');

      // 3. Click desktop expand button to reopen sidebar
      fireEvent.click(expandBtn);

      expect(store.getState().ui.isSidebarOpen).toBe(true);
      expect(screen.getByLabelText(/collapse sidebar/i)).toHaveAttribute('aria-expanded', 'true');
    });

    it('toggles desktop sidebar state when landing on workspace with no active session', () => {
      const { store } = renderWorkspace(['/workspace'], {
        auth: {
          token: 'mock-token',
          user: mockUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
        session: {
          sessionList: [],
          activeSession: null,
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
        },
      });

      expect(store.getState().ui.isSidebarOpen).toBe(true);

      // Collapse sidebar from sidebar header
      const collapseBtn = screen.getByLabelText(/collapse sidebar/i);
      fireEvent.click(collapseBtn);

      expect(store.getState().ui.isSidebarOpen).toBe(false);

      // Expand sidebar from workspace top navbar
      const expandBtn = screen.getByLabelText(/expand sidebar/i);
      expect(expandBtn).toBeInTheDocument();
      expect(expandBtn).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(expandBtn);

      expect(store.getState().ui.isSidebarOpen).toBe(true);
    });

    it('opens mobile drawer when mobile menu button is clicked', () => {
      const { store } = renderWorkspace(['/workspace'], {
        auth: {
          token: 'mock-token',
          user: mockUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
      });

      expect(store.getState().ui.isMobileDrawerOpen).toBe(false);

      // Click mobile hamburger menu
      const mobileBtn = screen.getByLabelText(/open sidebar menu/i);
      fireEvent.click(mobileBtn);

      expect(store.getState().ui.isMobileDrawerOpen).toBe(true);
      expect(screen.getByRole('dialog', { name: /mobile navigation history drawer/i })).toBeInTheDocument();
    });
  });
});
