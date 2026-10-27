// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AxiosError, type InternalAxiosRequestConfig, type AxiosAdapter } from 'axios';
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
  type SessionSummaryDTO,
  type QuotaMetaDTO,
} from '@mentora/shared';
import { apiClient, clearStoredToken, getStoredToken, setStoredToken } from '../services/apiClient.js';
import {
  createAppStore,
  type RootState,
  registerThunk,
  loginThunk,
  fetchMeThunk,
  updateProfileThunk,
  setQuota,
  clearAuthError,
  logout,
  fetchSessionsThunk,
  createSessionThunk,
  fetchSessionByIdThunk,
  switchSessionModeThunk,
  deleteSessionThunk,
  setActiveMode,
  setActiveSession,
  clearActiveSession,
  clearSessionError,
  startStreaming,
  appendStreamToken,
  setStreamError,
  finishStreaming,
  toggleSidebar,
  setSidebarOpen,
  toggleMobileDrawer,
  setMobileDrawerOpen,
  openProfileModal,
  closeProfileModal,
  addNotification,
  removeNotification,
  clearNotifications,
} from '../store/index.js';

describe('IMP-010: Redux Toolkit Store & Slices', () => {
  const originalAdapter = apiClient.defaults.adapter;

  const mockUser: UserDTO = {
    id: 'user-123',
    _id: 'user-123',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    profile: {
      isCompleted: true,
      educationLevel: EducationLevel.UNDERGRADUATE,
      preferredStyle: ExplanationStyle.VISUAL,
    },
    usageQuota: {
      dailyCount: 10,
      dailyLimit: 50,
      windowResetAt: '2026-10-28T00:00:00.000Z',
    },
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z',
  };

  const mockQuotaMeta: QuotaMetaDTO = {
    used: 12,
    limit: 50,
    resetAt: '2026-10-28T00:00:00.000Z',
  };

  const mockSession: TopicSessionDTO = {
    id: 'session-abc',
    _id: 'session-abc',
    userId: 'user-123',
    topicQuery: 'Binary Search Trees',
    normalizedTitle: 'Binary Search Trees',
    lastActiveMode: LearningMode.EXPLAIN,
    explainState: {
      status: ExplainStatus.READY,
      currentStepIndex: 1,
      cards: [
        {
          stepNumber: 1,
          stepType: ExplainStepType.INTUITION,
          title: 'Intuition of BST',
          contentMarkdown: 'BST keeps keys in sorted order for fast lookup.',
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
          title: 'Invariant Rule',
          description: 'Left subtree values < root < right subtree values',
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
    createdAt: '2026-10-27T12:00:00.000Z',
    updatedAt: '2026-10-27T12:00:00.000Z',
  };

  const mockSummary: SessionSummaryDTO = {
    id: 'session-abc',
    _id: 'session-abc',
    topicQuery: 'Binary Search Trees',
    normalizedTitle: 'Binary Search Trees',
    lastActiveMode: LearningMode.EXPLAIN,
    createdAt: '2026-10-27T12:00:00.000Z',
    updatedAt: '2026-10-27T12:00:00.000Z',
  };

  beforeEach(() => {
    clearStoredToken();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    clearStoredToken();
    vi.restoreAllMocks();
  });

  // 1. Acceptance Criteria 1: Mode Switching Continuity (FR-005)
  describe('1. Mode Switching Continuity (AC-1, FR-005)', () => {
    it('preserves activeSession explainState, interactState, and practiceState when setActiveMode is dispatched', () => {
      const store = createAppStore({
        session: {
          sessionList: [mockSummary],
          activeSession: mockSession,
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

      // Switch to INTERACT
      store.dispatch(setActiveMode(LearningMode.INTERACT));
      let state = store.getState().session;
      expect(state.activeMode).toBe(LearningMode.INTERACT);
      expect(state.activeSession?.lastActiveMode).toBe(LearningMode.INTERACT);
      expect(state.activeSession?.explainState.cards).toHaveLength(1);
      expect(state.activeSession?.interactState.milestones).toHaveLength(1);
      expect(state.activeSession?.practiceState.batches.easy.tier).toBe(PracticeTier.EASY);

      // Switch to PRACTICE
      store.dispatch(setActiveMode(LearningMode.PRACTICE));
      state = store.getState().session;
      expect(state.activeMode).toBe(LearningMode.PRACTICE);
      expect(state.activeSession?.lastActiveMode).toBe(LearningMode.PRACTICE);
      expect(state.activeSession?.explainState.cards[0]?.title).toBe('Intuition of BST');
      expect(state.activeSession?.interactState.milestones[0]?.title).toBe('Invariant Rule');
    });

    it('updates activeMode and activeSession.lastActiveMode on switchSessionModeThunk without clearing mode states', async () => {
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        return {
          data: {
            success: true,
            data: { lastActiveMode: LearningMode.INTERACT },
            meta: { quota: mockQuotaMeta },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };
      apiClient.defaults.adapter = mockAdapter;

      const store = createAppStore({
        session: {
          sessionList: [mockSummary],
          activeSession: { ...mockSession },
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

      await store.dispatch(
        switchSessionModeThunk({ id: mockSession.id, mode: LearningMode.INTERACT })
      );

      const state = store.getState();
      expect(state.session.activeMode).toBe(LearningMode.INTERACT);
      expect(state.session.activeSession?.lastActiveMode).toBe(LearningMode.INTERACT);
      expect(state.session.sessionList[0]?.lastActiveMode).toBe(LearningMode.INTERACT);
      expect(state.session.activeSession?.explainState.status).toBe(ExplainStatus.READY);
      expect(state.auth.quota).toEqual(mockQuotaMeta);
    });
  });

  // 2. Acceptance Criteria 2: Quota Synchronization (AC-2, BR-04)
  describe('2. Quota Synchronization (AC-2, BR-04)', () => {
    it('updates auth.quota when setQuota reducer is dispatched directly', () => {
      const store = createAppStore();
      expect(store.getState().auth.quota).toBeNull();

      store.dispatch(setQuota(mockQuotaMeta));
      expect(store.getState().auth.quota).toEqual(mockQuotaMeta);
    });

    it('synchronizes meta.quota into authSlice when createSessionThunk succeeds', async () => {
      const updatedQuota: QuotaMetaDTO = { used: 15, limit: 50, resetAt: '2026-10-28T00:00:00.000Z' };
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        return {
          data: {
            success: true,
            data: mockSession,
            meta: { quota: updatedQuota },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };
      apiClient.defaults.adapter = mockAdapter;

      const store = createAppStore();
      await store.dispatch(
        createSessionThunk({
          topicQuery: 'Binary Search Trees',
          initialMode: LearningMode.EXPLAIN,
        })
      );

      expect(store.getState().auth.quota).toEqual(updatedQuota);
      expect(store.getState().session.activeSession?.id).toBe(mockSession.id);
      expect(store.getState().session.sessionList).toHaveLength(1);
    });
  });

  // 3. Acceptance Criteria 3: Clean Logout Reset (AC-3)
  describe('3. Clean Logout Reset (AC-3)', () => {
    it('clears token, localStorage, user, quota, activeSession, and sessionList upon logout', () => {
      setStoredToken('existing-auth-token-xyz');

      const store = createAppStore({
        auth: {
          user: mockUser,
          token: 'existing-auth-token-xyz',
          quota: mockQuotaMeta,
          authStatus: 'authenticated',
          error: null,
        },
        session: {
          sessionList: [mockSummary],
          activeSession: mockSession,
          activeMode: LearningMode.INTERACT,
          isLoadingList: false,
          isLoadingSession: false,
          isCreatingSession: false,
          error: null,
          streamingState: {
            isStreaming: true,
            streamBuffer: 'Partial response',
            streamError: null,
            activeTurnId: 'turn-1',
          },
        },
        ui: {
          isSidebarOpen: true,
          isMobileDrawerOpen: true,
          isProfileModalOpen: true,
          notifications: [{ id: '1', type: 'info', message: 'Hello' }],
        },
      });

      store.dispatch(logout());

      const state: RootState = store.getState();
      // Auth Slice reset
      expect(state.auth.user).toBeNull();
      expect(state.auth.token).toBeNull();
      expect(state.auth.quota).toBeNull();
      expect(state.auth.authStatus).toBe('unauthenticated');
      expect(getStoredToken()).toBeNull();

      // Session Slice reset
      expect(state.session.activeSession).toBeNull();
      expect(state.session.sessionList).toEqual([]);
      expect(state.session.streamingState.isStreaming).toBe(false);
      expect(state.session.streamingState.streamBuffer).toBe('');

      // UI Slice reset
      expect(state.ui.isProfileModalOpen).toBe(false);
      expect(state.ui.isMobileDrawerOpen).toBe(false);
      expect(state.ui.notifications).toEqual([]);
    });
  });

  // 4. Auth & Profile Async Thunks
  describe('4. Auth & Profile Async Thunks', () => {
    it('registerThunk sets stored token, updates user, and sets authStatus to authenticated', async () => {
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        return {
          data: {
            success: true,
            data: { token: 'new-jwt-token', user: mockUser },
            meta: { quota: mockQuotaMeta },
          },
          status: 201,
          statusText: 'Created',
          headers: {},
          config,
        };
      };
      apiClient.defaults.adapter = mockAdapter;

      const store = createAppStore();
      await store.dispatch(
        registerThunk({ name: 'Ada', email: 'ada@example.com', password: 'password123' })
      );

      const state = store.getState().auth;
      expect(state.authStatus).toBe('authenticated');
      expect(state.user?.name).toBe('Ada Lovelace');
      expect(state.token).toBe('new-jwt-token');
      expect(getStoredToken()).toBe('new-jwt-token');
      expect(state.quota).toEqual(mockQuotaMeta);
    });

    it('loginThunk rejected sets authStatus to unauthenticated and records error', async () => {
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        throw new AxiosError(
          'Request failed with status code 401',
          'ERR_BAD_REQUEST',
          config,
          {},
          {
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            config,
            data: {
              success: false,
              error: {
                code: 'UNAUTHORIZED',
                message: 'Invalid credentials',
              },
            },
          }
        );
      };
      apiClient.defaults.adapter = mockAdapter;

      const store = createAppStore();
      await store.dispatch(loginThunk({ email: 'ada@example.com', password: 'wrong' }));

      const state = store.getState().auth;
      expect(state.authStatus).toBe('unauthenticated');
      expect(state.error?.code).toBe('UNAUTHORIZED');
      expect(state.error?.message).toBe('Invalid credentials');
    });

    it('fetchMeThunk 401 clears token and marks authStatus as unauthenticated', async () => {
      setStoredToken('expired-token');
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        throw new AxiosError(
          'Request failed with status code 401',
          'ERR_BAD_REQUEST',
          config,
          {},
          {
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            config,
            data: {
              success: false,
              error: {
                code: 'UNAUTHORIZED',
                message: 'Token expired',
              },
            },
          }
        );
      };
      apiClient.defaults.adapter = mockAdapter;

      const store = createAppStore({
        auth: {
          user: mockUser,
          token: 'expired-token',
          quota: mockQuotaMeta,
          authStatus: 'idle',
          error: null,
        },
      });

      await store.dispatch(fetchMeThunk());

      const state = store.getState().auth;
      expect(state.authStatus).toBe('unauthenticated');
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(getStoredToken()).toBeNull();
    });

    it('updateProfileThunk updates learner profile and quota', async () => {
      const updatedUser: UserDTO = {
        ...mockUser,
        profile: {
          isCompleted: true,
          educationLevel: EducationLevel.PROFESSIONAL,
          preferredStyle: ExplanationStyle.CONCISE_TECHNICAL,
        },
      };

      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        return {
          data: {
            success: true,
            data: updatedUser,
            meta: { quota: mockQuotaMeta },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };
      apiClient.defaults.adapter = mockAdapter;

      const store = createAppStore({
        auth: {
          user: mockUser,
          token: 'valid-token',
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
      });

      await store.dispatch(
        updateProfileThunk({
          educationLevel: EducationLevel.PROFESSIONAL,
          preferredStyle: ExplanationStyle.CONCISE_TECHNICAL,
        })
      );

      const state = store.getState().auth;
      expect(state.user?.profile.educationLevel).toBe(EducationLevel.PROFESSIONAL);
      expect(state.quota).toEqual(mockQuotaMeta);
    });

    it('clearAuthError resets error state to null', () => {
      const store = createAppStore({
        auth: {
          user: null,
          token: null,
          quota: null,
          authStatus: 'unauthenticated',
          error: { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Bad request' },
        },
      });

      expect(store.getState().auth.error).not.toBeNull();
      store.dispatch(clearAuthError());
      expect(store.getState().auth.error).toBeNull();
    });
  });

  // 5. Session CRUD & SSE Streaming Actions
  describe('5. Session CRUD & SSE Streaming Actions', () => {
    it('fetchSessionsThunk loads sessionList successfully', async () => {
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        return {
          data: {
            success: true,
            data: [mockSummary],
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };
      apiClient.defaults.adapter = mockAdapter;

      const store = createAppStore();
      await store.dispatch(fetchSessionsThunk());

      expect(store.getState().session.sessionList).toHaveLength(1);
      expect(store.getState().session.sessionList[0]?.topicQuery).toBe('Binary Search Trees');
    });

    it('fetchSessionByIdThunk populates activeSession and syncs activeMode', async () => {
      const interactSession: TopicSessionDTO = {
        ...mockSession,
        lastActiveMode: LearningMode.INTERACT,
      };

      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        return {
          data: {
            success: true,
            data: interactSession,
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };
      apiClient.defaults.adapter = mockAdapter;

      const store = createAppStore();
      await store.dispatch(fetchSessionByIdThunk('session-abc'));

      expect(store.getState().session.activeSession?.id).toBe('session-abc');
      expect(store.getState().session.activeMode).toBe(LearningMode.INTERACT);
    });

    it('deleteSessionThunk removes item from sessionList and clears activeSession if deleted', async () => {
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        return {
          data: {
            success: true,
            data: { deleted: true },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };
      apiClient.defaults.adapter = mockAdapter;

      const store = createAppStore({
        session: {
          sessionList: [mockSummary],
          activeSession: mockSession,
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

      await store.dispatch(deleteSessionThunk('session-abc'));

      expect(store.getState().session.sessionList).toHaveLength(0);
      expect(store.getState().session.activeSession).toBeNull();
    });

    it('setActiveSession and clearActiveSession manage activeSession state', () => {
      const store = createAppStore();
      expect(store.getState().session.activeSession).toBeNull();

      store.dispatch(setActiveSession(mockSession));
      expect(store.getState().session.activeSession?.id).toBe(mockSession.id);
      expect(store.getState().session.activeMode).toBe(mockSession.lastActiveMode);

      store.dispatch(clearActiveSession());
      expect(store.getState().session.activeSession).toBeNull();
    });

    it('clearSessionError resets error state', () => {
      const store = createAppStore({
        session: {
          sessionList: [],
          activeSession: null,
          activeMode: LearningMode.EXPLAIN,
          isLoadingList: false,
          isLoadingSession: false,
          isCreatingSession: false,
          error: { statusCode: 500, code: 'INTERNAL_SERVER_ERROR', message: 'Fail' },
          streamingState: {
            isStreaming: false,
            streamBuffer: '',
            streamError: null,
            activeTurnId: null,
          },
        },
      });

      store.dispatch(clearSessionError());
      expect(store.getState().session.error).toBeNull();
    });

    it('manages SSE streamingState lifecycle (startStreaming, appendStreamToken, setStreamError, finishStreaming)', () => {
      const store = createAppStore();
      let state = store.getState().session.streamingState;
      expect(state.isStreaming).toBe(false);
      expect(state.streamBuffer).toBe('');

      // Start streaming
      store.dispatch(startStreaming({ turnId: 'turn-999' }));
      state = store.getState().session.streamingState;
      expect(state.isStreaming).toBe(true);
      expect(state.activeTurnId).toBe('turn-999');
      expect(state.streamBuffer).toBe('');

      // Append tokens
      store.dispatch(appendStreamToken('Let us '));
      store.dispatch(appendStreamToken('consider...'));
      state = store.getState().session.streamingState;
      expect(state.streamBuffer).toBe('Let us consider...');

      // Finish streaming
      store.dispatch(finishStreaming());
      state = store.getState().session.streamingState;
      expect(state.isStreaming).toBe(false);
      expect(state.activeTurnId).toBeNull();
      expect(state.streamBuffer).toBe('Let us consider...');

      // Error handling mid-stream
      store.dispatch(startStreaming({ turnId: 'turn-1000' }));
      store.dispatch(setStreamError('Connection interrupted'));
      state = store.getState().session.streamingState;
      expect(state.isStreaming).toBe(false);
      expect(state.streamError).toBe('Connection interrupted');
    });
  });

  // 6. UI Slice Actions
  describe('6. UI Slice Actions', () => {
    it('handles sidebar toggles and explicit set', () => {
      const store = createAppStore();
      expect(store.getState().ui.isSidebarOpen).toBe(true);

      store.dispatch(toggleSidebar());
      expect(store.getState().ui.isSidebarOpen).toBe(false);

      store.dispatch(setSidebarOpen(true));
      expect(store.getState().ui.isSidebarOpen).toBe(true);
    });

    it('handles mobile drawer toggles and explicit set', () => {
      const store = createAppStore();
      expect(store.getState().ui.isMobileDrawerOpen).toBe(false);

      store.dispatch(toggleMobileDrawer());
      expect(store.getState().ui.isMobileDrawerOpen).toBe(true);

      store.dispatch(setMobileDrawerOpen(false));
      expect(store.getState().ui.isMobileDrawerOpen).toBe(false);
    });

    it('handles profile modal open and close', () => {
      const store = createAppStore();
      expect(store.getState().ui.isProfileModalOpen).toBe(false);

      store.dispatch(openProfileModal());
      expect(store.getState().ui.isProfileModalOpen).toBe(true);

      store.dispatch(closeProfileModal());
      expect(store.getState().ui.isProfileModalOpen).toBe(false);
    });

    it('handles notification queue add, remove, and clear', () => {
      const store = createAppStore();
      expect(store.getState().ui.notifications).toHaveLength(0);

      store.dispatch(
        addNotification({ id: 'n1', type: 'success', message: 'Profile updated successfully' })
      );
      store.dispatch(
        addNotification({ id: 'n2', type: 'error', message: 'Quota exceeded' })
      );

      let notifications = store.getState().ui.notifications;
      expect(notifications).toHaveLength(2);
      expect(notifications[0]?.message).toBe('Profile updated successfully');

      store.dispatch(removeNotification('n1'));
      notifications = store.getState().ui.notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0]?.id).toBe('n2');

      store.dispatch(clearNotifications());
      expect(store.getState().ui.notifications).toHaveLength(0);
    });
  });
});
