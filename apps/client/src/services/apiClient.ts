import axios, { type InternalAxiosRequestConfig } from 'axios';
import type { ErrorCode } from '@mentora/shared';
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

const mapStatusCodeToErrorCode = (status: number): ClientApiErrorCode => {
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
    const token = getStoredToken();
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  },
  (error: unknown) => {
    return Promise.reject(normalizeAxiosError(error));
  }
);

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    return Promise.reject(normalizeAxiosError(error));
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
