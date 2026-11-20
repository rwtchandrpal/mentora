import axios, { type InternalAxiosRequestConfig } from 'axios';
import { GUEST_TOKEN_HEADER, type ErrorCode } from '@mentora/shared';
import { env } from '../config/env.js';

export const TOKEN_STORAGE_KEY = 'mentora_auth_token';

export type ClientApiErrorCode =
  | ErrorCode
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'UNKNOWN_ERROR';

export interface NormalizedApiErrorData {
  statusCode: number;
  code: ClientApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export class NormalizedApiError extends Error implements NormalizedApiErrorData {
  readonly statusCode: number;
  readonly code: ClientApiErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(params: NormalizedApiErrorData) {
    super(params.message);
    this.name = 'NormalizedApiError';
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.details = params.details;
    Object.setPrototypeOf(this, NormalizedApiError.prototype);
  }
}

export const getStoredToken = (): string | null => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Safe fallback if localStorage is disabled or throws
  }
  return null;
};

export const setStoredToken = (token: string): void => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
  } catch {
    // Safe fallback if localStorage is disabled or throws
  }
};

export const clearStoredToken = (): void => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Safe fallback if localStorage is disabled or throws
  }
};

/**
 * Guest session access tokens, keyed by session ID. A guest token grants access to
 * exactly one ephemeral session and is issued when a guest creates that session.
 * Stored in localStorage so a guest can reopen their session in a new tab until it expires.
 */
export const GUEST_TOKENS_STORAGE_KEY = 'mentora_guest_tokens';

type GuestTokenMap = Record<string, string>;

/** Reads the `exp` claim (seconds) from a JWT without verifying it. */
const getJwtExpiryMs = (token: string): number | null => {
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return null;
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64)) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

const readGuestTokens = (): GuestTokenMap => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = window.localStorage.getItem(GUEST_TOKENS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const now = Date.now();
    const valid: GuestTokenMap = {};
    for (const [sessionId, token] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof token !== 'string') continue;
      const expiry = getJwtExpiryMs(token);
      if (expiry !== null && expiry <= now) continue; // drop expired tokens
      valid[sessionId] = token;
    }
    return valid;
  } catch {
    return {};
  }
};

const writeGuestTokens = (tokens: GuestTokenMap): void => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(GUEST_TOKENS_STORAGE_KEY, JSON.stringify(tokens));
    }
  } catch {
    // Safe fallback if localStorage is disabled or throws
  }
};

export const getGuestToken = (sessionId: string): string | null => {
  return readGuestTokens()[sessionId] ?? null;
};

export const setGuestToken = (sessionId: string, token: string): void => {
  writeGuestTokens({ ...readGuestTokens(), [sessionId]: token });
};

export const removeGuestToken = (sessionId: string): void => {
  const tokens = readGuestTokens();
  delete tokens[sessionId];
  writeGuestTokens(tokens);
};

/** Extracts the session ID from API paths such as `/sessions/:id` or `/sessions/:id/explain/init`. */
export const extractSessionIdFromUrl = (url: string | undefined): string | null => {
  if (!url) return null;
  const match = /\/sessions\/([^/?#]+)/.exec(url);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

/**
 * Builds the auth headers for a request: the user's bearer token when signed in,
 * otherwise the guest token for the session the URL targets (if this browser has one).
 */
export const buildAuthHeaders = (url: string | undefined): Record<string, string> => {
  const token = getStoredToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  const sessionId = extractSessionIdFromUrl(url);
  const guestToken = sessionId ? getGuestToken(sessionId) : null;
  return guestToken ? { [GUEST_TOKEN_HEADER]: guestToken } : {};
};

const mapStatusCodeToErrorCode =(status: number): ClientApiErrorCode => {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'PROFILE_INCOMPLETE';
    case 404:
      return 'RESOURCE_NOT_FOUND';
    case 409:
      return 'TIER_LOCKED';
    case 422:
      return 'EDUCATIONAL_GUARDRAIL_REFUSAL';
    case 429:
      return 'DAILY_QUOTA_EXCEEDED';
    case 502:
      return 'AI_UPSTREAM_FAILURE';
    default:
      return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'UNKNOWN_ERROR';
  }
};

export const normalizeAxiosError = (error: unknown): NormalizedApiError => {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const statusCode = error.response.status;
      const responseData = error.response.data as unknown;

      if (
        responseData &&
        typeof responseData === 'object' &&
        'error' in responseData &&
        responseData.error &&
        typeof responseData.error === 'object'
      ) {
        const errorObj = responseData.error as Record<string, unknown>;
        const rawCode = typeof errorObj['code'] === 'string' ? errorObj['code'] : 'UNKNOWN_ERROR';
        const message =
          typeof errorObj['message'] === 'string'
            ? errorObj['message']
            : 'An unexpected error occurred';
        const details =
          errorObj['details'] && typeof errorObj['details'] === 'object'
            ? (errorObj['details'] as Record<string, unknown>)
            : undefined;

        return new NormalizedApiError({
          statusCode,
          code: rawCode as ClientApiErrorCode,
          message,
          details,
        });
      }

      const fallbackMessage =
        responseData &&
        typeof responseData === 'object' &&
        'message' in responseData &&
        typeof (responseData as Record<string, unknown>)['message'] === 'string'
          ? ((responseData as Record<string, unknown>)['message'] as string)
          : error.message || `Request failed with status ${statusCode}`;

      return new NormalizedApiError({
        statusCode,
        code: mapStatusCodeToErrorCode(statusCode),
        message: fallbackMessage,
      });
    }

    if (error.code === 'ECONNABORTED' || error.message.toLowerCase().includes('timeout')) {
      return new NormalizedApiError({
        statusCode: 408,
        code: 'TIMEOUT_ERROR',
        message: 'Request timed out. Please check your connection and try again.',
      });
    }

    return new NormalizedApiError({
      statusCode: 0,
      code: 'NETWORK_ERROR',
      message: 'Network error. Please check your internet connection.',
    });
  }

  if (error instanceof NormalizedApiError) {
    return error;
  }

  if (error instanceof Error) {
    return new NormalizedApiError({
      statusCode: 0,
      code: 'UNKNOWN_ERROR',
      message: error.message,
    });
  }

  return new NormalizedApiError({
    statusCode: 0,
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred.',
  });
};

export const apiClient = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    for (const [name, value] of Object.entries(buildAuthHeaders(config.url))) {
      config.headers.set(name, value);
    }
    return config;
  },
  (error: unknown) => {
    return Promise.reject(normalizeAxiosError(error));
  }
);

/**
 * Called when a request that carried the user's bearer token is rejected with 401,
 * i.e. the stored token has expired or been revoked (A-09). The store registers a
 * handler that logs the user out; it lives here as a setter to avoid a circular
 * import between the API client and the store.
 */
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null): void => {
  unauthorizedHandler = handler;
};

export const notifyUnauthorized = (): void => {
  unauthorizedHandler?.();
};

const sentBearerToken = (error: unknown): boolean => {
  if (!axios.isAxiosError(error)) return false;
  const headers = error.config?.headers;
  if (!headers) return false;
  const value =
    typeof headers.get === 'function' ? headers.get('Authorization') : headers['Authorization'];
  return typeof value === 'string' && value.startsWith('Bearer ');
};

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const normalized = normalizeAxiosError(error);
    // Only a rejected bearer token means the session expired. A 401 without one
    // (wrong password, missing guest token) must not log anyone out.
    if (normalized.statusCode === 401 && sentBearerToken(error)) {
      notifyUnauthorized();
    }
    return Promise.reject(normalized);
  }
);

export const pingHealthCheck = async (): Promise<boolean> => {
  try {
    const response = await apiClient.get<{ status: string }>('/health', {
      timeout: 5000,
    });
    return response.status === 200;
  } catch {
    return false;
  }
};

export default apiClient;
