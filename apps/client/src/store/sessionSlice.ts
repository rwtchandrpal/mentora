import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import {
  LearningMode,
  type TopicSessionDTO,
  type SessionSummaryDTO,
  type CreateSessionRequestDTO,
  type ApiSuccessEnvelope,
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
}

export const initialStreamingState: StreamingState = {
  isStreaming: false,
  streamBuffer: '',
  streamError: null,
  activeTurnId: null,
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
    },
    clearActiveSession: (state) => {
      state.activeSession = null;
      state.streamingState = { ...initialStreamingState };
    },
    clearSessionError: (state) => {
      state.error = null;
    },
    startStreaming: (state, action: PayloadAction<{ turnId?: string } | undefined>) => {
      state.streamingState.isStreaming = true;
      state.streamingState.streamBuffer = '';
      state.streamingState.streamError = null;
      state.streamingState.activeTurnId = action.payload?.turnId ?? null;
    },
    appendStreamToken: (state, action: PayloadAction<string>) => {
      state.streamingState.streamBuffer += action.payload;
    },
    setStreamError: (state, action: PayloadAction<string>) => {
      state.streamingState.isStreaming = false;
      state.streamingState.streamError = action.payload;
    },
    finishStreaming: (state) => {
      state.streamingState.isStreaming = false;
      state.streamingState.activeTurnId = null;
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
      state.sessionList = action.payload.data;
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
  startStreaming,
  appendStreamToken,
  setStreamError,
  finishStreaming,
} = sessionSlice.actions;

export default sessionSlice.reducer;
