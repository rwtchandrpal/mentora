import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
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

export const fetchMeThunk = createAsyncThunk<
  ApiSuccessEnvelope<UserDTO>,
  void,
  { rejectValue: NormalizedApiErrorData }
>('auth/fetchMe', async (_, { rejectWithValue }) => {
  try {
    const response = await apiClient.get<ApiSuccessEnvelope<UserDTO>>('/auth/me');
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
      }
      state.authStatus = 'unauthenticated';
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
export default authSlice.reducer;
