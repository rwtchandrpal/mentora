// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AxiosError, type AxiosAdapter } from 'axios';
import '@testing-library/jest-dom/vitest';
import { apiClient, clearStoredToken } from '../services/apiClient.js';
import { createAppStore } from '../store/index.js';
import { WorkspacePage } from '../pages/WorkspacePage.js';

describe('LIVE-FIX-010: guest quota badge hydration', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let quotaCalls: number;

  const renderGuest = (preloadedQuota: { used: number; limit: number; resetAt: string } | null = null) => {
    const store = createAppStore({
      auth: { token: null, user: null, quota: preloadedQuota, authStatus: 'unauthenticated', error: null },
    });
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/workspace']}>
          <Routes>
            <Route path="/workspace" element={<WorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );
    return store;
  };

  const respond = (data: unknown): AxiosAdapter => async (config) => {
    if (config.url === '/quota') quotaCalls += 1;
    return { data: { success: true, data }, status: 200, statusText: 'OK', headers: {}, config };
  };

  beforeEach(() => {
    cleanup();
    clearStoredToken();
    window.localStorage.clear();
    quotaCalls = 0;
  });

  afterEach(() => {
    cleanup();
    apiClient.defaults.adapter = originalAdapter;
  });

  it('shows the server-reported guest quota on load, before any AI action', async () => {
    apiClient.defaults.adapter = respond({
      quota: { used: 4, limit: 15, resetAt: '2026-11-23T10:00:00.000Z' },
    });
    const store = renderGuest();

    const badge = await screen.findAllByRole('status', { name: /ai daily usage quota/i });
    expect(badge.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/11 \/ 15 left/).length).toBeGreaterThan(0);
    expect(store.getState().auth.quota?.used).toBe(4);
  });

  it('does not request the quota when one is already known', async () => {
    apiClient.defaults.adapter = respond({});
    renderGuest({ used: 2, limit: 15, resetAt: '2026-11-23T10:00:00.000Z' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(quotaCalls).toBe(0);
  });

  it('stays hidden, without an error, when the quota request fails', async () => {
    apiClient.defaults.adapter = async (config) => {
      if (config.url === '/quota') {
        quotaCalls += 1;
        throw new AxiosError('boom', 'ERR_BAD_RESPONSE', config, null, {
          data: { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'x' } },
          status: 500,
          statusText: 'Err',
          headers: {},
          config,
        });
      }
      return { data: { success: true, data: [] }, status: 200, statusText: 'OK', headers: {}, config };
    };
    const store = renderGuest();
    await waitFor(() => expect(quotaCalls).toBeGreaterThan(0));
    expect(store.getState().auth.quota).toBeNull();
    expect(screen.queryByRole('status', { name: /ai daily usage quota/i })).toBeNull();
  });
});
