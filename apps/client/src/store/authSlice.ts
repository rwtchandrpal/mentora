import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { clearQuizDrafts } from '../utils/quizDraftStorage.js';
import type {
  UserDTO,
  QuotaMetaDTO,
  UsageQuotaDTO,
  RegisterRequestDTO,
  LoginRequestDTO,
  StaticLearnerProfileInputDTO,
  AuthResponseDataDTO,
  ApiSuccessEnvelope,
} from '@mentora/shared';
import {
  apiClient,
  getStoredToken,
  setStoredToken,
  clearStoredToken,
  normalizeAxiosError,
  type NormalizedApiErrorData,
} from '../services/apiClient.js';

export type QuotaMetadata = QuotaMetaDTO;

export interface AuthState {
  user: UserDTO | null;
  token: string | null;
  quota: QuotaMetadata | null;
  authStatus: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  error: NormalizedApiErrorData | null;
}

export const mapUsageQuotaToQuotaMeta = (usage: UsageQuotaDTO): QuotaMetadata => ({
  used: usage.dailyCount,
  limit: usage.dailyLimit,
  resetAt: usage.windowResetAt,
});

const initialToken = getStoredToken();

export const initialAuthState: AuthState = {
  user: null,
  token: initialToken,
  quota: null,
  authStatus: initialToken ? 'idle' : 'unauthenticated',
  error: null,
};

export const registerThunk = createAsyncThunk<
  ApiSuccessEnvelope<AuthResponseDataDTO>,
  RegisterRequestDTO,
  { rejectValue: NormalizedApiErrorData }
>('auth/register', async (payload, { rejectWithValue }) => {
  try {
    const response = await apiClient.post<ApiSuccessEnvelope<AuthResponseDataDTO>>(
      '/auth/register',
      payload
    );
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

export const loginThunk = createAsyncThunk<
  ApiSuccessEnvelope<AuthResponseDataDTO>,
  LoginRequestDTO,
  { rejectValue: NormalizedApiErrorData }
>('auth/login', async (payload, { rejectWithValue }) => {
  try {
    const response = await apiClient.post<ApiSuccessEnvelope<AuthResponseDataDTO>>(
      '/auth/login',
      payload
    );
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

/** Back-off before the single automatic retry of a failed `/auth/me` (A-22). */
export const FETCH_ME_RETRY_DELAY_MS = 1000;

export const fetchMeThunk = createAsyncThunk<
  ApiSuccessEnvelope<UserDTO>,
  void,
  { rejectValue: NormalizedApiErrorData }
>('auth/fetchMe', async (_, { rejectWithValue }) => {
  const attempt = async () =>
    (await apiClient.get<ApiSuccessEnvelope<UserDTO>>('/auth/me')).data;
  try {
    try {
      return await attempt();
    } catch (firstError) {
      // A 401 is final (the token is invalid). Anything else is likely transient,
      // e.g. a cold-starting backend, so retry once after a short back-off.
      if (normalizeAxiosError(firstError).statusCode === 401) {
        throw firstError;
      }
      await new Promise((resolve) => setTimeout(resolve, FETCH_ME_RETRY_DELAY_MS));
      return await attempt();
    }
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

export const updateProfileThunk = createAsyncThunk<
  ApiSuccessEnvelope<UserDTO>,
  StaticLearnerProfileInputDTO,
  { rejectValue: NormalizedApiErrorData }
>('auth/updateProfile', async (payload, { rejectWithValue }) => {
  try {
    const response = await apiClient.put<ApiSuccessEnvelope<UserDTO>>('/profile', payload);
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

export const authSlice = createSlice({
  name: 'auth',
  initialState: initialAuthState,
  reducers: {
    setQuota: (state, action: PayloadAction<QuotaMetadata>) => {
      state.quota = action.payload;
    },
    clearAuthError: (state) => {
      state.error = null;
    },
    logout: (state) => {
      clearStoredToken();
      // Unsubmitted quiz answers belong to this user; don't leave them for the next one (L-12).
      clearQuizDrafts();
      state.user = null;
      state.token = null;
      state.quota = null;
      state.error = null;
      state.authStatus = 'unauthenticated';
    },
  },
  extraReducers: (builder) => {
    // registerThunk
    builder.addCase(registerThunk.pending, (state) => {
      state.authStatus = 'loading';
      state.error = null;
    });
    builder.addCase(registerThunk.fulfilled, (state, action) => {
      const { user, token } = action.payload.data;
      setStoredToken(token);
      state.token = token;
      state.user = user;
      state.quota =
        action.payload.meta?.quota ??
        (user.usageQuota ? mapUsageQuotaToQuotaMeta(user.usageQuota) : null);
      state.authStatus = 'authenticated';
      state.error = null;
    });
    builder.addCase(registerThunk.rejected, (state, action) => {
      state.authStatus = 'unauthenticated';
      state.error = action.payload ?? {
        statusCode: 0,
        code: 'UNKNOWN_ERROR',
        message: action.error.message || 'Registration failed',
      };
    });

    // loginThunk
    builder.addCase(loginThunk.pending, (state) => {
      state.authStatus = 'loading';
      state.error = null;
    });
    builder.addCase(loginThunk.fulfilled, (state, action) => {
      const { user, token } = action.payload.data;
      setStoredToken(token);
      state.token = token;
      state.user = user;
      state.quota =
        action.payload.meta?.quota ??
        (user.usageQuota ? mapUsageQuotaToQuotaMeta(user.usageQuota) : null);
      state.authStatus = 'authenticated';
      state.error = null;
    });
    builder.addCase(loginThunk.rejected, (state, action) => {
      state.authStatus = 'unauthenticated';
      state.error = action.payload ?? {
        statusCode: 0,
        code: 'UNKNOWN_ERROR',
        message: action.error.message || 'Login failed',
      };
    });

    // fetchMeThunk
    builder.addCase(fetchMeThunk.pending, (state) => {
      state.authStatus = 'loading';
      state.error = null;
    });
    builder.addCase(fetchMeThunk.fulfilled, (state, action) => {
      const user = action.payload.data;
      state.user = user;
      state.quota =
        action.payload.meta?.quota ??
        (user.usageQuota ? mapUsageQuotaToQuotaMeta(user.usageQuota) : null);
      state.authStatus = 'authenticated';
      state.error = null;
    });
    builder.addCase(fetchMeThunk.rejected, (state, action) => {
      if (action.payload?.statusCode === 401) {
        clearStoredToken();
        state.token = null;
        state.user = null;
        state.quota = null;
        state.authStatus = 'unauthenticated';
      } else {
        // The token may still be valid; the check itself failed (network, 5xx).
        // Stay 'idle' with the error set so the guards offer a retry instead of
        // leaving a token with no user marked 'unauthenticated' (A-22).
        state.authStatus = 'idle';
      }
      state.error = action.payload ?? {
        statusCode: 0,
        code: 'UNKNOWN_ERROR',
        message: action.error.message || 'Authentication check failed',
      };
    });

    // updateProfileThunk
    builder.addCase(updateProfileThunk.pending, (state) => {
      state.error = null;
    });
    builder.addCase(updateProfileThunk.fulfilled, (state, action) => {
      const user = action.payload.data;
      state.user = user;
      if (action.payload.meta?.quota) {
        state.quota = action.payload.meta.quota;
      }
      state.error = null;
    });
    builder.addCase(updateProfileThunk.rejected, (state, action) => {
      state.error = action.payload ?? {
        statusCode: 0,
        code: 'UNKNOWN_ERROR',
        message: action.error.message || 'Profile update failed',
      };
    });
  },
});

export const { setQuota, clearAuthError, logout } = authSlice.actions;

export const selectIsGuest = (state: { auth: AuthState }): boolean =>
  !state.auth.token && state.auth.user === null;

export default authSlice.reducer;
