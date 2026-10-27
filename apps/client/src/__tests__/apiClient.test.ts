// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig, type AxiosAdapter } from 'axios';
import '@testing-library/jest-dom/vitest';
import { parseClientEnv } from '../config/env.js';
import {
  apiClient,
  getStoredToken,
  setStoredToken,
  clearStoredToken,
  TOKEN_STORAGE_KEY,
  NormalizedApiError,
  normalizeAxiosError,
  pingHealthCheck,
} from '../services/apiClient.js';
import { ErrorBoundary } from '../components/common/ErrorBoundary.js';

describe('IMP-009: Client Foundation, API Client, and Error Boundary', () => {
  const originalAdapter = apiClient.defaults.adapter;

  beforeEach(() => {
    clearStoredToken();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
    apiClient.defaults.adapter = originalAdapter;
    clearStoredToken();
    vi.restoreAllMocks();
  });

  // 1. Startup Environment Validation Tests
  describe('1. Startup Environment Validation (src/config/env.ts)', () => {
    it('accepts valid HTTP/HTTPS URLs', () => {
      const parsedLocal = parseClientEnv({
        VITE_API_BASE_URL: 'http://localhost:4000/api/v1',
      });
      expect(parsedLocal.VITE_API_BASE_URL).toBe('http://localhost:4000/api/v1');

      const parsedProd = parseClientEnv({
        VITE_API_BASE_URL: 'https://mentora-api.onrender.com/api/v1',
      });
      expect(parsedProd.VITE_API_BASE_URL).toBe('https://mentora-api.onrender.com/api/v1');
    });

    it('throws a descriptive error when VITE_API_BASE_URL is missing', () => {
      expect(() => parseClientEnv({})).toThrowError(
        /\[Mentora Client Env Validation Error\] Invalid environment configuration: VITE_API_BASE_URL: VITE_API_BASE_URL is required/
      );
    });

    it('throws a descriptive error when VITE_API_BASE_URL is not a valid URL', () => {
      expect(() =>
        parseClientEnv({ VITE_API_BASE_URL: 'invalid-url-string' })
      ).toThrowError(
        /\[Mentora Client Env Validation Error\] Invalid environment configuration: VITE_API_BASE_URL: VITE_API_BASE_URL must be a valid URL/
      );
    });

    it('throws a descriptive error when VITE_API_BASE_URL is empty', () => {
      expect(() =>
        parseClientEnv({ VITE_API_BASE_URL: '' })
      ).toThrowError(/VITE_API_BASE_URL must be a valid URL/);
    });
  });

  // 2. Token Storage and Request Interceptor Tests
  describe('2. Token Storage Helpers & Request Interceptor', () => {
    it('persists, retrieves, and clears JWT token in localStorage safely', () => {
      expect(getStoredToken()).toBeNull();

      setStoredToken('test-jwt-token-12345');
      expect(getStoredToken()).toBe('test-jwt-token-12345');
      expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('test-jwt-token-12345');

      clearStoredToken();
      expect(getStoredToken()).toBeNull();
      expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('automatically attaches Authorization: Bearer <token> when token is stored', async () => {
      setStoredToken('mock-access-token-abc');
      let capturedAuthHeader: string | undefined;

      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        const headerValue = config.headers.get('Authorization');
        capturedAuthHeader = typeof headerValue === 'string' ? headerValue : undefined;

        return {
          data: { success: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };

      apiClient.defaults.adapter = mockAdapter;

      await apiClient.get('/test-route');
      expect(capturedAuthHeader).toBe('Bearer mock-access-token-abc');
    });

    it('omits Authorization header when no token is present', async () => {
      clearStoredToken();
      let capturedAuthHeader: string | undefined;

      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        const headerValue = config.headers.get('Authorization');
        capturedAuthHeader = typeof headerValue === 'string' ? headerValue : undefined;

        return {
          data: { success: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };

      apiClient.defaults.adapter = mockAdapter;

      await apiClient.get('/test-route');
      expect(capturedAuthHeader).toBeUndefined();
    });
  });

  // 3. Response / Error Interceptor Normalization Tests
  describe('3. Response Error Interceptor & Error Normalization', () => {
    it('normalizes 401 UNAUTHORIZED structured backend error envelope', async () => {
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
                message: 'Invalid email or password',
              },
            },
          }
        );
      };

      apiClient.defaults.adapter = mockAdapter;

      try {
        await apiClient.post('/auth/login', {});
        expect.fail('Should have rejected with NormalizedApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(NormalizedApiError);
        const error = err as NormalizedApiError;
        expect(error.statusCode).toBe(401);
        expect(error.code).toBe('UNAUTHORIZED');
        expect(error.message).toBe('Invalid email or password');
        expect(error.details).toBeUndefined();
      }
    });

    it('normalizes 429 DAILY_QUOTA_EXCEEDED with details.resetAt', async () => {
      const resetTimestamp = '2026-10-28T00:00:00.000Z';
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        throw new AxiosError(
          'Request failed with status code 429',
          'ERR_BAD_REQUEST',
          config,
          {},
          {
            status: 429,
            statusText: 'Too Many Requests',
            headers: {},
            config,
            data: {
              success: false,
              error: {
                code: 'DAILY_QUOTA_EXCEEDED',
                message: 'Daily quota limit of 50 actions reached',
                details: { resetAt: resetTimestamp },
              },
            },
          }
        );
      };

      apiClient.defaults.adapter = mockAdapter;

      try {
        await apiClient.post('/sessions', {});
        expect.fail('Should have rejected with NormalizedApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(NormalizedApiError);
        const error = err as NormalizedApiError;
        expect(error.statusCode).toBe(429);
        expect(error.code).toBe('DAILY_QUOTA_EXCEEDED');
        expect(error.message).toBe('Daily quota limit of 50 actions reached');
        expect(error.details).toEqual({ resetAt: resetTimestamp });
      }
    });

    it('normalizes 403 PROFILE_INCOMPLETE structured error', async () => {
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        throw new AxiosError(
          'Request failed with status code 403',
          'ERR_BAD_REQUEST',
          config,
          {},
          {
            status: 403,
            statusText: 'Forbidden',
            headers: {},
            config,
            data: {
              success: false,
              error: {
                code: 'PROFILE_INCOMPLETE',
                message: 'Please complete learner profile onboarding first',
              },
            },
          }
        );
      };

      apiClient.defaults.adapter = mockAdapter;

      try {
        await apiClient.get('/sessions');
        expect.fail('Should have rejected with NormalizedApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(NormalizedApiError);
        const error = err as NormalizedApiError;
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe('PROFILE_INCOMPLETE');
      }
    });

    it('normalizes 422 EDUCATIONAL_GUARDRAIL_REFUSAL structured error', async () => {
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        throw new AxiosError(
          'Request failed with status code 422',
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
                message: 'Non-educational content cannot be processed',
              },
            },
          }
        );
      };

      apiClient.defaults.adapter = mockAdapter;

      try {
        await apiClient.post('/sessions', {});
        expect.fail('Should have rejected');
      } catch (err) {
        expect(err).toBeInstanceOf(NormalizedApiError);
        const error = err as NormalizedApiError;
        expect(error.statusCode).toBe(422);
        expect(error.code).toBe('EDUCATIONAL_GUARDRAIL_REFUSAL');
      }
    });

    it('normalizes unexpected non-envelope HTTP 500 error gracefully', async () => {
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        throw new AxiosError(
          'Request failed with status code 500',
          'ERR_BAD_RESPONSE',
          config,
          {},
          {
            status: 500,
            statusText: 'Internal Server Error',
            headers: {},
            config,
            data: '<html>500 Server Error</html>',
          }
        );
      };

      apiClient.defaults.adapter = mockAdapter;

      try {
        await apiClient.get('/some-route');
        expect.fail('Should have rejected');
      } catch (err) {
        expect(err).toBeInstanceOf(NormalizedApiError);
        const error = err as NormalizedApiError;
        expect(error.statusCode).toBe(500);
        expect(error.code).toBe('INTERNAL_SERVER_ERROR');
        expect(error.message).toContain('500');
      }
    });

    it('normalizes network errors (no response) to NETWORK_ERROR', () => {
      const networkError = new AxiosError('Network Error', 'ERR_NETWORK');
      const normalized = normalizeAxiosError(networkError);

      expect(normalized.statusCode).toBe(0);
      expect(normalized.code).toBe('NETWORK_ERROR');
      expect(normalized.message).toBe('Network error. Please check your internet connection.');
    });

    it('normalizes timeout errors (ECONNABORTED) to TIMEOUT_ERROR with statusCode 408', () => {
      const timeoutError = new AxiosError('timeout of 15000ms exceeded', 'ECONNABORTED');
      const normalized = normalizeAxiosError(timeoutError);

      expect(normalized.statusCode).toBe(408);
      expect(normalized.code).toBe('TIMEOUT_ERROR');
      expect(normalized.message).toBe('Request timed out. Please check your connection and try again.');
    });

    it('normalizes generic non-axios errors into UNKNOWN_ERROR', () => {
      const genericError = new Error('Random runtime crash');
      const normalized = normalizeAxiosError(genericError);

      expect(normalized.statusCode).toBe(0);
      expect(normalized.code).toBe('UNKNOWN_ERROR');
      expect(normalized.message).toBe('Random runtime crash');
    });
  });

  // 4. Cold-Start Wake-Up Utility (pingHealthCheck) Tests
  describe('4. Cold-Start Wake-Up Utility (pingHealthCheck)', () => {
    it('resolves to true when GET /health responds with 200 OK', async () => {
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        return {
          data: { status: 'ok', uptime: 123 },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };

      apiClient.defaults.adapter = mockAdapter;

      const isHealthy = await pingHealthCheck();
      expect(isHealthy).toBe(true);
    });

    it('resolves to false without throwing when GET /health returns 500 error', async () => {
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        throw new AxiosError(
          'Internal Server Error',
          'ERR_BAD_RESPONSE',
          config,
          {},
          {
            status: 500,
            statusText: 'Internal Server Error',
            headers: {},
            config,
            data: { status: 'error' },
          }
        );
      };

      apiClient.defaults.adapter = mockAdapter;

      const isHealthy = await pingHealthCheck();
      expect(isHealthy).toBe(false);
    });

    it('resolves to false without throwing when network fails (backend waking up)', async () => {
      const mockAdapter: AxiosAdapter = async () => {
        throw new AxiosError('Network Error', 'ERR_NETWORK');
      };

      apiClient.defaults.adapter = mockAdapter;

      const isHealthy = await pingHealthCheck();
      expect(isHealthy).toBe(false);
    });
  });

  // 5. Top-Level ErrorBoundary Component Tests
  describe('5. ErrorBoundary Component (src/components/common/ErrorBoundary.tsx)', () => {
    const ProblematicChild: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
      if (shouldThrow) {
        throw new Error('Explosive component render error');
      }
      return React.createElement('div', null, 'Safe child content rendered cleanly');
    };

    it('renders children normally when no error is thrown', () => {
      render(
        React.createElement(
          ErrorBoundary,
          null,
          React.createElement(ProblematicChild, { shouldThrow: false })
        )
      );

      expect(screen.getByText('Safe child content rendered cleanly')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('catches thrown rendering error and displays accessible fallback UI with Reload button', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        React.createElement(
          ErrorBoundary,
          null,
          React.createElement(ProblematicChild, { shouldThrow: true })
        )
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByText(/Explosive component render error/)).toBeInTheDocument();

      const reloadButton = screen.getByRole('button', { name: /reload application/i });
      expect(reloadButton).toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });

    it('renders custom fallback ReactNode when fallback prop is provided', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        React.createElement(
          ErrorBoundary,
          { fallback: React.createElement('div', { role: 'alert' }, 'Custom Fallback View') },
          React.createElement(ProblematicChild, { shouldThrow: true })
        )
      );

      expect(screen.getByText('Custom Fallback View')).toBeInTheDocument();
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });

    it('renders custom fallback function with reset callback when provided', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        React.createElement(
          ErrorBoundary,
          {
            fallback: (error, reset) =>
              React.createElement(
                'div',
                null,
                React.createElement('p', null, `Error: ${error.message}`),
                React.createElement('button', { onClick: reset }, 'Try Again')
              ),
          },
          React.createElement(ProblematicChild, { shouldThrow: true })
        )
      );

      expect(screen.getByText('Error: Explosive component render error')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });
  });
});
