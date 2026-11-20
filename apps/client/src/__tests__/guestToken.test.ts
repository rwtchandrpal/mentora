// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { GUEST_TOKEN_HEADER, LearningMode } from '@mentora/shared';
import {
  apiClient,
  setStoredToken,
  clearStoredToken,
  getGuestToken,
  setGuestToken,
  removeGuestToken,
  extractSessionIdFromUrl,
  buildAuthHeaders,
  GUEST_TOKENS_STORAGE_KEY,
} from '../services/apiClient.js';
import { createAppStore } from '../store/index.js';
import { createSessionThunk, deleteSessionThunk } from '../store/sessionSlice.js';

/** Builds an unsigned JWT-shaped string whose payload carries the given `exp` (seconds). */
const fakeJwt = (expSeconds: number): string => {
  const encode = (value: object): string =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sid: 'x', typ: 'guest', exp: expSeconds })}.sig`;
};

const inOneHour = (): number => Math.floor(Date.now() / 1000) + 3600;

describe('Guest session tokens (A-01, client side)', () => {
  const originalAdapter = apiClient.defaults.adapter;

  beforeEach(() => {
    window.localStorage.clear();
    clearStoredToken();
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
  });

  it('stores, reads and removes guest tokens per session', () => {
    const tokenA = fakeJwt(inOneHour());
    const tokenB = fakeJwt(inOneHour());
    setGuestToken('session-a', tokenA);
    setGuestToken('session-b', tokenB);

    expect(getGuestToken('session-a')).toBe(tokenA);
    expect(getGuestToken('session-b')).toBe(tokenB);

    removeGuestToken('session-a');
    expect(getGuestToken('session-a')).toBeNull();
    expect(getGuestToken('session-b')).toBe(tokenB);
  });

  it('drops expired tokens and tolerates corrupted storage', () => {
    setGuestToken('expired', fakeJwt(Math.floor(Date.now() / 1000) - 10));
    expect(getGuestToken('expired')).toBeNull();

    window.localStorage.setItem(GUEST_TOKENS_STORAGE_KEY, '{not json');
    expect(getGuestToken('anything')).toBeNull();
  });

  it('extracts the session ID from session-scoped API paths only', () => {
    expect(extractSessionIdFromUrl('/sessions/abc123')).toBe('abc123');
    expect(extractSessionIdFromUrl('/sessions/abc123/explain/init')).toBe('abc123');
    expect(extractSessionIdFromUrl('/sessions')).toBeNull();
    expect(extractSessionIdFromUrl('/auth/me')).toBeNull();
  });

  it('prefers the user bearer token over any guest token', () => {
    setGuestToken('abc123', fakeJwt(inOneHour()));
    setStoredToken('user-token');
    expect(buildAuthHeaders('/sessions/abc123')).toEqual({ Authorization: 'Bearer user-token' });
  });

  it('attaches the matching guest token header to session requests when signed out', async () => {
    const token = fakeJwt(inOneHour());
    setGuestToken('abc123', token);

    const captured: Array<string | undefined> = [];
    const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      const value = config.headers.get(GUEST_TOKEN_HEADER);
      captured.push(typeof value === 'string' ? value : undefined);
      return { data: { success: true }, status: 200, statusText: 'OK', headers: {}, config };
    };
    apiClient.defaults.adapter = mockAdapter;

    await apiClient.get('/sessions/abc123');
    await apiClient.post('/sessions/abc123/explain/init');
    await apiClient.get('/sessions/other-session');

    expect(captured).toEqual([token, token, undefined]);
  });

  it('persists the guest token returned on session creation and forgets it on delete', async () => {
    const token = fakeJwt(inOneHour());
    const session = { id: 'guest-session-1' };

    const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      if (config.method === 'post') {
        return {
          data: { success: true, data: session, meta: { guestToken: token } },
          status: 201,
          statusText: 'Created',
          headers: {},
          config,
        };
      }
      return {
        data: { success: true, data: { deletedId: session.id } },
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
        topicQuery: 'Photosynthesis',
        initialMode: LearningMode.EXPLAIN,
        autoInitialize: false,
      })
    );
    expect(getGuestToken(session.id)).toBe(token);

    await store.dispatch(deleteSessionThunk(session.id));
    expect(getGuestToken(session.id)).toBeNull();
  });
});
