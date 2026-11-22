import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import {
  CONNECTION_INTERRUPTED_MESSAGE,
  SERVER_RESTARTING_MESSAGE,
  useSseStream,
} from '../hooks/useSseStream.js';
import { Provider } from 'react-redux';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { LearningMode } from '@mentora/shared';
import {
  apiClient,
  configureServerWake,
  NETWORK_ERROR_MESSAGE,
  NormalizedApiError,
  SERVICE_UNAVAILABLE_MESSAGE,
  setServerWakeListener,
} from '../services/apiClient.js';
import { createAppStore } from '../store/index.js';
import { switchSessionModeThunk } from '../store/sessionSlice.js';
import { setServerWaking } from '../store/uiSlice.js';
import { ServerStatusBanner } from '../components/common/ServerStatusBanner.js';

/**
 * LIVE-FIX-004: when the API is down (Render restart or cold start), the browser only
 * sees a network error. The client must then wait for /health and retry once, instead
 * of telling the user to check their internet connection.
 */
describe('LIVE-FIX-004: server wake-up handling in the API client', () => {
  const originalAdapter = apiClient.defaults.adapter;

  const networkError = (config: InternalAxiosRequestConfig) =>
    new AxiosError('Network Error', 'ERR_NETWORK', config);

  const ok = (config: InternalAxiosRequestConfig, data: unknown = { success: true, data: 'ok' }) => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });

  /**
   * Fake API: `/health` fails `healthDownFor` times, then answers; other requests fail
   * with a network error until the health check has answered once.
   */
  const installFakeApi = (options: { healthDownFor: number; failFirstRequests?: boolean }) => {
    const calls = { health: 0, other: [] as string[] };
    let serverUp = false;
    const adapter: AxiosAdapter = async (config) => {
      if (config.url === '/health') {
        calls.health += 1;
        if (calls.health <= options.healthDownFor) throw networkError(config);
        serverUp = true;
        return ok(config, { status: 'ok' });
      }
      calls.other.push(`${config.method?.toUpperCase()} ${config.url}`);
      if (options.failFirstRequests !== false && !serverUp) throw networkError(config);
      return ok(config);
    };
    apiClient.defaults.adapter = adapter;
    return calls;
  };

  beforeEach(() => {
    configureServerWake({ enabled: true, delaysMs: [0, 0, 0] });
  });

  afterEach(() => {
    configureServerWake({ enabled: false });
    setServerWakeListener(null);
    apiClient.defaults.adapter = originalAdapter;
    vi.restoreAllMocks();
  });

  it('waits for the server and retries the request once when /health is also down', async () => {
    const calls = installFakeApi({ healthDownFor: 2 });
    const wakeEvents: boolean[] = [];
    setServerWakeListener((isWaking) => wakeEvents.push(isWaking));

    const response = await apiClient.get('/sessions/abc');

    expect(response.status).toBe(200);
    expect(calls.other).toEqual(['GET /sessions/abc', 'GET /sessions/abc']);
    // 1 probe right after the failure, then the back-off probes until it answered.
    expect(calls.health).toBe(3);
    expect(wakeEvents).toEqual([true, false]);
  });

  it('keeps the network error (no wait, no retry) when the server is reachable', async () => {
    const calls = { health: 0, other: 0 };
    apiClient.defaults.adapter = async (config) => {
      if (config.url === '/health') {
        calls.health += 1;
        return ok(config, { status: 'ok' });
      }
      calls.other += 1;
      throw networkError(config);
    };
    const listener = vi.fn();
    setServerWakeListener(listener);

    const error = await apiClient.get('/sessions/abc').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NormalizedApiError);
    expect((error as NormalizedApiError).code).toBe('NETWORK_ERROR');
    expect((error as NormalizedApiError).message).toBe(NETWORK_ERROR_MESSAGE);
    expect(calls).toEqual({ health: 1, other: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('reports the server as unavailable (not the user’s connection) when it never comes back', async () => {
    const calls = installFakeApi({ healthDownFor: Number.POSITIVE_INFINITY });

    const error = await apiClient.patch('/sessions/abc/mode', { mode: 'practice' }).catch(
      (e: unknown) => e
    );

    expect((error as NormalizedApiError).code).toBe('SERVICE_UNAVAILABLE');
    expect((error as NormalizedApiError).statusCode).toBe(503);
    expect((error as NormalizedApiError).message).toBe(SERVICE_UNAVAILABLE_MESSAGE);
    expect(calls.other).toEqual(['PATCH /sessions/abc/mode']); // not retried
  });

  it('shares one wait (and one banner) between requests that fail together', async () => {
    const calls = installFakeApi({ healthDownFor: 3 });
    const wakeEvents: boolean[] = [];
    setServerWakeListener((isWaking) => wakeEvents.push(isWaking));

    const [a, b] = await Promise.all([
      apiClient.patch('/sessions/abc/mode', { mode: 'practice' }),
      apiClient.post('/sessions/abc/practice/generate', { tier: 'easy' }),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(wakeEvents).toEqual([true, false]);
    expect(calls.other.filter((c) => c.startsWith('PATCH'))).toHaveLength(2);
    expect(calls.other.filter((c) => c.startsWith('POST'))).toHaveLength(2);
  });

  it('never waits on the health probe itself or retries more than once', async () => {
    let otherCalls = 0;
    let healthCalls = 0;
    apiClient.defaults.adapter = async (config) => {
      if (config.url === '/health') {
        healthCalls += 1;
        // Down for the first probe, up for the wait, but the retried request fails again.
        if (healthCalls === 1) throw networkError(config);
        return ok(config, { status: 'ok' });
      }
      otherCalls += 1;
      throw networkError(config);
    };

    const error = await apiClient.get('/sessions/abc').catch((e: unknown) => e);

    expect((error as NormalizedApiError).code).toBe('NETWORK_ERROR');
    expect(otherCalls).toBe(2); // original + exactly one retry
  });

  it('recovers a mode switch made while the server was restarting (BUG-M4)', async () => {
    installFakeApi({ healthDownFor: 1 });
    const store = createAppStore();

    const result = await store.dispatch(
      switchSessionModeThunk({ id: 'abc', mode: LearningMode.PRACTICE })
    );

    expect(switchSessionModeThunk.fulfilled.match(result)).toBe(true);
    expect(store.getState().session.error).toBeNull();
    expect(store.getState().ui.isServerWaking).toBe(false);
  });

  it('tells the learner the server is restarting when an Interact stream fails while it is down', async () => {
    installFakeApi({ healthDownFor: 1 });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const store = createAppStore();
    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <Provider store={store}>{children}</Provider>
    );
    const { result } = renderHook(() => useSseStream('abc'), { wrapper });

    await act(async () => {
      await result.current.sendMessage('I think the left subtree holds smaller keys');
    });

    expect(store.getState().session.streamingState.streamError).toBe(SERVER_RESTARTING_MESSAGE);
    // The turn is not resent automatically.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the connection-interrupted message when the server is reachable', async () => {
    apiClient.defaults.adapter = async (config) => ok(config, { status: 'ok' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const store = createAppStore();
    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <Provider store={store}>{children}</Provider>
    );
    const { result } = renderHook(() => useSseStream('abc'), { wrapper });

    await act(async () => {
      await result.current.sendMessage('I think the left subtree holds smaller keys');
    });

    expect(store.getState().session.streamingState.streamError).toBe(
      CONNECTION_INTERRUPTED_MESSAGE
    );
  });

  it('shows the waking-up banner only while the client is waiting', () => {
    const store = createAppStore();
    render(
      <Provider store={store}>
        <ServerStatusBanner />
      </Provider>
    );
    expect(screen.queryByTestId('server-waking-banner')).toBeNull();

    act(() => {
      store.dispatch(setServerWaking(true));
    });
    expect(screen.getByRole('status')).toHaveTextContent(/server is waking up/i);

    act(() => {
      store.dispatch(setServerWaking(false));
    });
    expect(screen.queryByTestId('server-waking-banner')).toBeNull();
  });
});
