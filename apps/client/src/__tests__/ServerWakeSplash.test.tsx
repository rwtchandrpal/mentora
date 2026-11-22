// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import '@testing-library/jest-dom/vitest';
import { createAppStore } from '../store/index.js';
import { setServerWaking } from '../store/uiSlice.js';
import { ServerWakeSplash } from '../components/common/ServerWakeSplash.js';

const ping = vi.hoisted(() => vi.fn<() => Promise<boolean>>());
vi.mock('../services/apiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/apiClient.js')>()),
  pingHealthCheck: ping,
}));

const flush = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const setup = () => {
  const store = createAppStore();
  render(
    <Provider store={store}>
      <ServerWakeSplash showAfterMs={1500} pollIntervalMs={2000} giveUpAfterMs={10_000} expectedMs={60_000} />
    </Provider>
  );
  return store;
};

describe('Server waking-up splash', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ping.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows nothing when the API answers immediately', async () => {
    ping.mockResolvedValue(true);
    setup();
    await flush(5000);
    expect(screen.queryByTestId('server-wake-splash')).toBeNull();
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('shows nothing when the API answers before the 1.5 s threshold', async () => {
    ping.mockImplementation(() => new Promise((r) => setTimeout(() => r(true), 1000)));
    setup();
    await flush(2000);
    expect(screen.queryByTestId('server-wake-splash')).toBeNull();
  });

  it('shows the splash with progress after 1.5 s, keeps probing, and hides when the API answers', async () => {
    let up = false;
    ping.mockImplementation(async () => up);
    setup();

    await flush(1400);
    expect(screen.queryByTestId('server-wake-splash')).toBeNull();

    await flush(200);
    expect(screen.getByTestId('server-wake-splash')).toBeInTheDocument();
    expect(screen.getByText(/waking up mentora/i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    await flush(6000);
    expect(ping.mock.calls.length).toBeGreaterThan(2);
    expect(screen.getByText(/s elapsed/)).toBeInTheDocument();
    expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeGreaterThan(0);

    up = true;
    await flush(2500);
    expect(screen.queryByTestId('server-wake-splash')).toBeNull();
    const calls = ping.mock.calls.length;
    await flush(10_000);
    expect(ping.mock.calls.length).toBe(calls); // probing stopped
  });

  it('gives up probing after the cap and hides the splash', async () => {
    ping.mockResolvedValue(false);
    setup();
    await flush(11_000);
    expect(screen.queryByTestId('server-wake-splash')).toBeNull();
    const calls = ping.mock.calls.length;
    await flush(10_000);
    expect(ping.mock.calls.length).toBe(calls);
  });

  it('does not stack on top of the request-level waking banner', async () => {
    ping.mockResolvedValue(false);
    const store = setup();
    await flush(2000);
    expect(screen.getByTestId('server-wake-splash')).toBeInTheDocument();
    act(() => {
      store.dispatch(setServerWaking(true));
    });
    expect(screen.queryByTestId('server-wake-splash')).toBeNull();
  });
});
