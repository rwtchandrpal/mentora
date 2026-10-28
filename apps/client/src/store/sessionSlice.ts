import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import {
  LearningMode,
  InteractStatus,
  PracticeTier,
  type TopicSessionDTO,
  type SessionSummaryDTO,
  type CreateSessionRequestDTO,
  type ApiSuccessEnvelope,
  type SseMetadataEventDTO,
} from '@mentora/shared';
import {
  apiClient,
  normalizeAxiosError,
  type NormalizedApiErrorData,
} from '../services/apiClient.js';
import { setQuota, logout, type QuotaMetadata } from './authSlice.js';

export interface StreamingState {
  isStreaming: boolean;
  streamBuffer: string;
  streamError: string | null;
  activeTurnId: string | null;
  activeTurnMessage?: string | null;
}

export interface SessionState {
  sessionList: SessionSummaryDTO[];
  activeSession: TopicSessionDTO | null;
  activeMode: LearningMode;
  isLoadingList: boolean;
  isLoadingSession: boolean;
  isCreatingSession: boolean;
  error: NormalizedApiErrorData | null;
  streamingState: StreamingState;
  isInitializingExplain: boolean;
  deepDiveLoadingStep: number | null;
  explainError: NormalizedApiErrorData | null;
  isInitializingInteract: boolean;
  interactError: NormalizedApiErrorData | null;
  isGeneratingPractice: boolean;
  isSubmittingPractice: boolean;
  practiceError: NormalizedApiErrorData | null;
}

export const initialStreamingState: StreamingState = {
  isStreaming: false,
  streamBuffer: '',
  streamError: null,
  activeTurnId: null,
  activeTurnMessage: null,
};

export const initialSessionState: SessionState = {
  sessionList: [],
  activeSession: null,
  activeMode: LearningMode.EXPLAIN,
  isLoadingList: false,
  isLoadingSession: false,
  isCreatingSession: false,
  error: null,
  streamingState: initialStreamingState,
  isInitializingExplain: false,
  deepDiveLoadingStep: null,
  explainError: null,
  isInitializingInteract: false,
  interactError: null,
  isGeneratingPractice: false,
  isSubmittingPractice: false,
  practiceError: null,
};

export const fetchSessionsThunk = createAsyncThunk<
  ApiSuccessEnvelope<SessionSummaryDTO[]>,
  void,
  { rejectValue: NormalizedApiErrorData }
>('session/fetchList', async (_, { dispatch, rejectWithValue }) => {
  try {
    const response = await apiClient.get<ApiSuccessEnvelope<SessionSummaryDTO[]>>('/sessions');
    if (response.data.meta?.quota) {
      dispatch(setQuota(response.data.meta.quota));
    }
    return response.data;
  } catch (error) {
    const normalized = normalizeAxiosError(error);
    return rejectWithValue({
      statusCode: normalized.statusCode,
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
    });
  }
});

export const createSessionThunk = createAsyncThunk<
  ApiSuccessEnvelope<TopicSessionDTO>,
  CreateSessionRequestDTO,
  { rejectValue: NormalizedApiErrorData }
>('session/create', async (payload, { dispatch, rejectWithValue }) => {
  try {
    const response = await apiClient.post<ApiSuccessEnvelope<TopicSessionDTO>>(
      '/sessions',
      payload
    );
    if (response.data.meta?.quota) {
      dispatch(setQuota(response.data.meta.quota));
    }
    return response.data;
  } catch (error) {
    const normalized = normalizeAxiosError(error);
    return rejectWithValue({
      statusCode: normalized.statusCode,
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
    });
  }
});

export const fetchSessionByIdThunk = createAsyncThunk<
  ApiSuccessEnvelope<TopicSessionDTO>,
  string,
  { rejectValue: NormalizedApiErrorData }
>('session/fetchById', async (id, { dispatch, rejectWithValue }) => {
  try {
    const response = await apiClient.get<ApiSuccessEnvelope<TopicSessionDTO>>(`/sessions/${id}`);
    if (response.data.meta?.quota) {
      dispatch(setQuota(response.data.meta.quota));
    }
    return response.data;
  } catch (error) {
    const normalized = normalizeAxiosError(error);
    return rejectWithValue({
      statusCode: normalized.statusCode,
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
    });
  }
});

export const switchSessionModeThunk = createAsyncThunk<
  { mode: LearningMode; quota?: QuotaMetadata },
  { id: string; mode: LearningMode },
  { rejectValue: NormalizedApiErrorData }
>('session/switchMode', async ({ id, mode }, { dispatch, rejectWithValue }) => {
  try {
    const response = await apiClient.patch<ApiSuccessEnvelope<{ lastActiveMode: LearningMode }>>(
      `/sessions/${id}/mode`,
      { mode }
    );
    if (response.data.meta?.quota) {
      dispatch(setQuota(response.data.meta.quota));
    }
    return { mode, quota: response.data.meta?.quota };
  } catch (error) {
    const normalized = normalizeAxiosError(error);
    return rejectWithValue({
      statusCode: normalized.statusCode,
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
    });
  }
});

export const deleteSessionThunk = createAsyncThunk<
  string,
  string,
  { rejectValue: NormalizedApiErrorData }
>('session/delete', async (id, { dispatch, rejectWithValue }) => {
  try {
    const response = await apiClient.delete<ApiSuccessEnvelope<{ deleted: boolean }>>(
      `/sessions/${id}`
    );
    if (response.data.meta?.quota) {
      dispatch(setQuota(response.data.meta.quota));
    }
    return id;
  } catch (error) {
    const normalized = normalizeAxiosError(error);
    return rejectWithValue({
      statusCode: normalized.statusCode,
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
    });
  }
});

export const initializeExplainThunk = createAsyncThunk<
  ApiSuccessEnvelope<TopicSessionDTO>,
  string,
  { rejectValue: NormalizedApiErrorData }
>('session/initializeExplain', async (sessionId, { dispatch, rejectWithValue }) => {
  try {
    const response = await apiClient.post<ApiSuccessEnvelope<TopicSessionDTO>>(
      `/sessions/${sessionId}/explain/init`
    );
    if (response.data.meta?.quota) {
      dispatch(setQuota(response.data.meta.quota));
    }
    return response.data;
  } catch (error) {
    const normalized = normalizeAxiosError(error);
    return rejectWithValue({
      statusCode: normalized.statusCode,
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
    });
  }
});

export const advanceExplainStepThunk = createAsyncThunk<
  ApiSuccessEnvelope<TopicSessionDTO>,
  { sessionId: string; stepIndex: number },
  { rejectValue: NormalizedApiErrorData }
>('session/advanceExplainStep', async ({ sessionId, stepIndex }, { dispatch, rejectWithValue }) => {
  try {
    const response = await apiClient.patch<ApiSuccessEnvelope<TopicSessionDTO>>(
      `/sessions/${sessionId}/explain/step`,
      { stepIndex }
    );
    if (response.data.meta?.quota) {
      dispatch(setQuota(response.data.meta.quota));
    }
    return response.data;
  } catch (error) {
    const normalized = normalizeAxiosError(error);
    return rejectWithValue({
      statusCode: normalized.statusCode,
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
    });
  }
});

export const generateDeepDiveThunk = createAsyncThunk<
  ApiSuccessEnvelope<TopicSessionDTO>,
  { sessionId: string; stepNumber: number },
  { rejectValue: NormalizedApiErrorData }
>('session/generateDeepDive', async ({ sessionId, stepNumber }, { dispatch, rejectWithValue }) => {
  try {
    const response = await apiClient.post<ApiSuccessEnvelope<TopicSessionDTO>>(
      `/sessions/${sessionId}/explain/deeper`,
      { stepNumber }
    );
    if (response.data.meta?.quota) {
      dispatch(setQuota(response.data.meta.quota));
    }
    return response.data;
  } catch (error) {
    const normalized = normalizeAxiosError(error);
    return rejectWithValue({
      statusCode: normalized.statusCode,
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
    });
  }
});

export const initializeInteractThunk = createAsyncThunk<
  ApiSuccessEnvelope<TopicSessionDTO>,
  string,
  { rejectValue: NormalizedApiErrorData }
>('session/initializeInteract', async (sessionId, { dispatch, rejectWithValue }) => {
  try {
    const response = await apiClient.post<ApiSuccessEnvelope<TopicSessionDTO>>(
      `/sessions/${sessionId}/interact/init`
    );
    if (response.data.meta?.quota) {
      dispatch(setQuota(response.data.meta.quota));
    }
    return response.data;
  } catch (error) {
    const normalized = normalizeAxiosError(error);
    return rejectWithValue({
      statusCode: normalized.statusCode,
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
    });
  }
});

export const generatePracticeBatchThunk = createAsyncThunk<
  ApiSuccessEnvelope<TopicSessionDTO>,
  { sessionId: string; tier: PracticeTier },
  { rejectValue: NormalizedApiErrorData }
>('session/generatePracticeBatch', async ({ sessionId, tier }, { dispatch, rejectWithValue }) => {
  try {
    const response = await apiClient.post<ApiSuccessEnvelope<TopicSessionDTO>>(
      `/sessions/${sessionId}/practice/generate`,
      { tier },
      { timeout: 45000 }
    );
    if (response.data.meta?.quota) {
      dispatch(setQuota(response.data.meta.quota));
    }
    return response.data;
  } catch (error) {
    const normalized = normalizeAxiosError(error);
    return rejectWithValue({
      statusCode: normalized.statusCode,
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
    });
  }
});

export const submitPracticeBatchThunk = createAsyncThunk<
  ApiSuccessEnvelope<TopicSessionDTO>,
  { sessionId: string; tier: PracticeTier; answers: number[] },
  { rejectValue: NormalizedApiErrorData }
>('session/submitPracticeBatch', async ({ sessionId, tier, answers }, { dispatch, rejectWithValue }) => {
  try {
    const response = await apiClient.post<ApiSuccessEnvelope<TopicSessionDTO>>(
      `/sessions/${sessionId}/practice/submit`,
      { tier, answers }
    );
    if (response.data.meta?.quota) {
      dispatch(setQuota(response.data.meta.quota));
    }
    return response.data;
  } catch (error) {
    const normalized = normalizeAxiosError(error);
    return rejectWithValue({
      statusCode: normalized.statusCode,
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
    });
  }
});

export const sessionSlice = createSlice({
  name: 'session',
  initialState: initialSessionState,
  reducers: {
    setActiveMode: (state, action: PayloadAction<LearningMode>) => {
      state.activeMode = action.payload;
      if (state.activeSession) {
        state.activeSession.lastActiveMode = action.payload;
      }
    },
    setActiveSession: (state, action: PayloadAction<TopicSessionDTO | null>) => {
      state.activeSession = action.payload;
      if (action.payload) {
        state.activeMode = action.payload.lastActiveMode;
      }
      state.streamingState = { ...initialStreamingState };
      state.isInitializingExplain = false;
      state.deepDiveLoadingStep = null;
      state.explainError = null;
      state.isInitializingInteract = false;
      state.interactError = null;
      state.isGeneratingPractice = false;
      state.isSubmittingPractice = false;
      state.practiceError = null;
    },
    clearActiveSession: (state) => {
      state.activeSession = null;
      state.streamingState = { ...initialStreamingState };
      state.isInitializingExplain = false;
      state.deepDiveLoadingStep = null;
      state.explainError = null;
      state.isInitializingInteract = false;
      state.interactError = null;
      state.isGeneratingPractice = false;
      state.isSubmittingPractice = false;
      state.practiceError = null;
    },
    clearSessionError: (state) => {
      state.error = null;
    },
    clearExplainError: (state) => {
      state.explainError = null;
    },
    clearInteractError: (state) => {
      state.interactError = null;
    },
    clearPracticeError: (state) => {
      state.practiceError = null;
    },
    startStreaming: (
      state,
      action: PayloadAction<{ turnId?: string; message?: string } | undefined>
    ) => {
      state.streamingState.isStreaming = true;
      state.streamingState.streamBuffer = '';
      state.streamingState.streamError = null;
      state.streamingState.activeTurnId = action?.payload?.turnId ?? null;
      state.streamingState.activeTurnMessage = action?.payload?.message ?? null;
    },
    appendStreamToken: (state, action: PayloadAction<string>) => {
      state.streamingState.streamBuffer += action.payload;
    },
    setStreamError: (state, action: PayloadAction<string>) => {
      state.streamingState.isStreaming = false;
      state.streamingState.streamError = action.payload;
    },
    clearStreamError: (state) => {
      state.streamingState.streamError = null;
      state.streamingState.streamBuffer = '';
      state.streamingState.activeTurnMessage = null;
    },
    finishStreaming: (state) => {
      state.streamingState.isStreaming = false;
      state.streamingState.activeTurnId = null;
      state.streamingState.activeTurnMessage = null;
    },
    applyInteractMetadata: (state, action: PayloadAction<SseMetadataEventDTO>) => {
      if (state.activeSession?.interactState) {
        state.activeSession.interactState.activeMilestoneIndex =
          action.payload.activeMilestoneIndex;
        state.activeSession.interactState.strikeCount = action.payload.strikeCount;
        state.activeSession.interactState.milestones = action.payload.milestones;
        if (action.payload.isCompleted) {
          state.activeSession.interactState.status = InteractStatus.COMPLETED;
        }
        if (action.payload.userMessage) {
          const userMsg = action.payload.userMessage;
          const exists = state.activeSession.interactState.messages.some(
            (m) => m.id === userMsg.id
          );
          if (!exists) {
            state.activeSession.interactState.messages.push(userMsg);
          }
        }
        if (action.payload.assistantMessage) {
          const asstMsg = action.payload.assistantMessage;
          const exists = state.activeSession.interactState.messages.some(
            (m) => m.id === asstMsg.id
          );
          if (!exists) {
            state.activeSession.interactState.messages.push(asstMsg);
          }
        }
      }
    },
  },
  extraReducers: (builder) => {
    // fetchSessionsThunk
    builder.addCase(fetchSessionsThunk.pending, (state) => {
      state.isLoadingList = true;
      state.error = null;
    });
    builder.addCase(fetchSessionsThunk.fulfilled, (state, action) => {
      state.isLoadingList = false;
      state.sessionList = Array.isArray(action.payload?.data) ? action.payload.data : [];
      state.error = null;
    });
    builder.addCase(fetchSessionsThunk.rejected, (state, action) => {
      state.isLoadingList = false;
      state.error = action.payload ?? {
        statusCode: 0,
        code: 'UNKNOWN_ERROR',
        message: action.error.message || 'Failed to fetch sessions',
      };
    });

    // createSessionThunk
    builder.addCase(createSessionThunk.pending, (state) => {
      state.isCreatingSession = true;
      state.error = null;
    });
    builder.addCase(createSessionThunk.fulfilled, (state, action) => {
      const session = action.payload.data;
      state.isCreatingSession = false;
      state.activeSession = session;
      state.activeMode = session.lastActiveMode;
      state.error = null;
      state.streamingState = { ...initialStreamingState };

      const summary: SessionSummaryDTO = {
        id: session.id,
        _id: session._id,
        topicQuery: session.topicQuery,
        normalizedTitle: session.normalizedTitle,
        lastActiveMode: session.lastActiveMode,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      };

      state.sessionList = [
        summary,
        ...state.sessionList.filter((s) => s.id !== session.id && s._id !== session._id),
      ];
    });
    builder.addCase(createSessionThunk.rejected, (state, action) => {
      state.isCreatingSession = false;
      state.error = action.payload ?? {
        statusCode: 0,
        code: 'UNKNOWN_ERROR',
        message: action.error.message || 'Failed to create session',
      };
    });

    // fetchSessionByIdThunk
    builder.addCase(fetchSessionByIdThunk.pending, (state) => {
      state.isLoadingSession = true;
      state.error = null;
    });
    builder.addCase(fetchSessionByIdThunk.fulfilled, (state, action) => {
      const session = action.payload.data;
      state.isLoadingSession = false;
      state.activeSession = session;
      state.activeMode = session.lastActiveMode;
      state.error = null;
      state.streamingState = { ...initialStreamingState };
    });
    builder.addCase(fetchSessionByIdThunk.rejected, (state, action) => {
      state.isLoadingSession = false;
      state.error = action.payload ?? {
        statusCode: 0,
        code: 'UNKNOWN_ERROR',
        message: action.error.message || 'Failed to load session',
      };
    });

    // switchSessionModeThunk
    builder.addCase(switchSessionModeThunk.fulfilled, (state, action) => {
      state.activeMode = action.payload.mode;
      if (state.activeSession) {
        state.activeSession.lastActiveMode = action.payload.mode;
      }
      const activeId = state.activeSession?.id ?? state.activeSession?._id;
      if (activeId) {
        const summary = state.sessionList.find((s) => s.id === activeId || s._id === activeId);
        if (summary) {
          summary.lastActiveMode = action.payload.mode;
        }
      }
    });
    builder.addCase(switchSessionModeThunk.rejected, (state, action) => {
      state.error = action.payload ?? {
        statusCode: 0,
        code: 'UNKNOWN_ERROR',
        message: action.error.message || 'Failed to switch mode',
      };
    });

    // deleteSessionThunk
    builder.addCase(deleteSessionThunk.fulfilled, (state, action) => {
      const deletedId = action.payload;
      state.sessionList = state.sessionList.filter(
        (s) => s.id !== deletedId && s._id !== deletedId
      );
      if (
        state.activeSession &&
        (state.activeSession.id === deletedId || state.activeSession._id === deletedId)
      ) {
        state.activeSession = null;
        state.streamingState = { ...initialStreamingState };
      }
    });
    builder.addCase(deleteSessionThunk.rejected, (state, action) => {
      state.error = action.payload ?? {
        statusCode: 0,
        code: 'UNKNOWN_ERROR',
        message: action.error.message || 'Failed to delete session',
      };
    });

    // initializeExplainThunk
    builder.addCase(initializeExplainThunk.pending, (state) => {
      state.isInitializingExplain = true;
      state.explainError = null;
    });
    builder.addCase(initializeExplainThunk.fulfilled, (state, action) => {
      state.isInitializingExplain = false;
      state.activeSession = action.payload.data;
      state.explainError = null;
    });
    builder.addCase(initializeExplainThunk.rejected, (state, action) => {
      state.isInitializingExplain = false;
      state.explainError = action.payload ?? {
        statusCode: 0,
        code: 'UNKNOWN_ERROR',
        message: action.error.message || 'Failed to initialize explain mode',
      };
    });

    // advanceExplainStepThunk
    builder.addCase(advanceExplainStepThunk.pending, (state, action) => {
      if (state.activeSession?.explainState) {
        state.activeSession.explainState.currentStepIndex = action.meta.arg.stepIndex;
      }
      state.explainError = null;
    });
    builder.addCase(advanceExplainStepThunk.fulfilled, (state, action) => {
      state.activeSession = action.payload.data;
      state.explainError = null;
    });
    builder.addCase(advanceExplainStepThunk.rejected, (state, action) => {
      state.explainError = action.payload ?? {
        statusCode: 0,
        code: 'UNKNOWN_ERROR',
        message: action.error.message || 'Failed to advance step',
      };
    });

    // generateDeepDiveThunk
    builder.addCase(generateDeepDiveThunk.pending, (state, action) => {
      state.deepDiveLoadingStep = action.meta.arg.stepNumber;
      state.explainError = null;
    });
    builder.addCase(generateDeepDiveThunk.fulfilled, (state, action) => {
      state.deepDiveLoadingStep = null;
      state.activeSession = action.payload.data;
      state.explainError = null;
    });
    builder.addCase(generateDeepDiveThunk.rejected, (state, action) => {
      state.deepDiveLoadingStep = null;
      state.explainError = action.payload ?? {
        statusCode: 0,
        code: 'UNKNOWN_ERROR',
        message: action.error.message || 'Failed to generate deep dive',
      };
    });

    // initializeInteractThunk
    builder.addCase(initializeInteractThunk.pending, (state) => {
      state.isInitializingInteract = true;
      state.interactError = null;
    });
    builder.addCase(initializeInteractThunk.fulfilled, (state, action) => {
      state.isInitializingInteract = false;
      state.activeSession = action.payload.data;
      state.interactError = null;
    });
    builder.addCase(initializeInteractThunk.rejected, (state, action) => {
      state.isInitializingInteract = false;
      state.interactError = action.payload ?? {
        statusCode: 0,
        code: 'UNKNOWN_ERROR',
        message: action.error.message || 'Failed to initialize interact mode',
      };
    });

    // generatePracticeBatchThunk
    builder.addCase(generatePracticeBatchThunk.pending, (state) => {
      state.isGeneratingPractice = true;
      state.practiceError = null;
    });
    builder.addCase(generatePracticeBatchThunk.fulfilled, (state, action) => {
      state.isGeneratingPractice = false;
      state.activeSession = action.payload.data;
      state.practiceError = null;
    });
    builder.addCase(generatePracticeBatchThunk.rejected, (state, action) => {
      state.isGeneratingPractice = false;
      state.practiceError = action.payload ?? {
        statusCode: 0,
        code: 'UNKNOWN_ERROR',
        message: action.error.message || 'Failed to generate practice batch',
      };
    });

    // submitPracticeBatchThunk
    builder.addCase(submitPracticeBatchThunk.pending, (state) => {
      state.isSubmittingPractice = true;
      state.practiceError = null;
    });
    builder.addCase(submitPracticeBatchThunk.fulfilled, (state, action) => {
      state.isSubmittingPractice = false;
      state.activeSession = action.payload.data;
      state.practiceError = null;
    });
    builder.addCase(submitPracticeBatchThunk.rejected, (state, action) => {
      state.isSubmittingPractice = false;
      state.practiceError = action.payload ?? {
        statusCode: 0,
        code: 'UNKNOWN_ERROR',
        message: action.error.message || 'Failed to submit practice batch',
      };
    });

    // Reset on logout from authSlice
    builder.addCase(logout, () => {
      return { ...initialSessionState };
    });
  },
});

export const {
  setActiveMode,
  setActiveSession,
  clearActiveSession,
  clearSessionError,
  clearExplainError,
  clearInteractError,
  clearPracticeError,
  startStreaming,
  appendStreamToken,
  setStreamError,
  clearStreamError,
  finishStreaming,
  applyInteractMetadata,
} = sessionSlice.actions;

export default sessionSlice.reducer;
