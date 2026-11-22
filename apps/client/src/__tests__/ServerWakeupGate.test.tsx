// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ServerWakeupGate } from '../components/common/ServerWakeupGate.js';
import { resetServerReadinessCache } from '../hooks/useServerReadiness.js';

const health = vi.hoisted(() => vi.fn<(signal?: AbortSignal) => Promise<boolean>>());
vi.mock('../services/apiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/apiClient.js')>()),
  checkServerHealth: health,
}));

const OPTIONS = {
  graceMs: 350,
  pollIntervalMs: 2500,
  requestTimeoutMs: 10_000,
  maxWaitMs: 20_000,
  slowHintMs: 6000,
};

const flush = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const renderGate = () =>
  render(
    <ServerWakeupGate options={OPTIONS}>
      <div data-testid="workspace">workspace</div>
    </ServerWakeupGate>
  );

describe('ServerWakeupGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    health.mockReset();
    resetServerReadinessCache();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('warm server: never shows the card and renders the workspace directly', async () => {
    health.mockResolvedValue(true);
    renderGate();
    expect(screen.queryByTestId('wake-card')).toBeNull();
    await flush(0);
    expect(screen.getByTestId('workspace')).toBeInTheDocument();
    await flush(1000);
    expect(screen.queryByTestId('wake-card')).toBeNull();
    expect(health).toHaveBeenCalledTimes(1);
  });

  it('warm but slightly slow (under 350 ms): still no card', async () => {
    health.mockImplementation(() => new Promise((r) => setTimeout(() => r(true), 300)));
    renderGate();
    await flush(299);
    expect(screen.queryByTestId('wake-card')).toBeNull();
    await flush(10);
    expect(screen.getByTestId('workspace')).toBeInTheDocument();
    expect(screen.queryByTestId('wake-card')).toBeNull();
  });

  it('does not render the workspace while the server is not ready', async () => {
    health.mockResolvedValue(false);
    renderGate();
    await flush(1000);
    expect(screen.queryByTestId('workspace')).toBeNull();
  });

  it('cold server: shows the dots card, polls, then renders the workspace on 200', async () => {
    health.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true);
    renderGate();

    await flush(0);
    // A fast 503 means "cold": the card appears straight away.
    expect(screen.getByTestId('wake-card')).toBeInTheDocument();
    expect(screen.getByText('Creating a learning session for you')).toBeInTheDocument();
    expect(screen.getByTestId('wake-dots').children).toHaveLength(3);
    expect(screen.queryByText(/warming up the workspace/i)).toBeNull();
    expect(screen.queryByTestId('workspace')).toBeNull();

    await flush(2500);
    expect(health).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('workspace')).toBeNull();

    await flush(2500);
    expect(health).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('workspace')).toBeInTheDocument();
    expect(screen.queryByTestId('wake-card')).toBeNull();
  });

  it('slow server (no answer within 350 ms): shows the card, then the longer-wait hint after 6 s', async () => {
    let up = false;
    health.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(up), 4000)) // each probe hangs 4 s
    );
    renderGate();

    await flush(349);
    expect(screen.queryByTestId('wake-card')).toBeNull();
    await flush(10);
    expect(screen.getByTestId('wake-card')).toBeInTheDocument();

    await flush(6000);
    expect(screen.getByText(/warming up the workspace/i)).toBeInTheDocument();

    up = true;
    await flush(10_000);
    expect(screen.getByTestId('workspace')).toBeInTheDocument();
  });

  it('timeout: shows Try Again, stops polling, and Try Again re-polls and unlocks the workspace', async () => {
    let up = false;
    health.mockImplementation(async () => up);
    renderGate();

    await flush(OPTIONS.maxWaitMs + 1000);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText('Creating a learning session for you')).toBeNull();
    expect(screen.queryByTestId('workspace')).toBeNull();

    const callsAtTimeout = health.mock.calls.length;
    await flush(10_000);
    expect(health.mock.calls.length).toBe(callsAtTimeout);

    up = true;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await flush(0);
    expect(health.mock.calls.length).toBeGreaterThan(callsAtTimeout);
    expect(screen.getByTestId('workspace')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('remembers readiness: a remount never re-checks or shows the gate', async () => {
    health.mockResolvedValue(true);
    const first = renderGate();
    await flush(0);
    expect(screen.getByTestId('workspace')).toBeInTheDocument();
    first.unmount();

    health.mockClear();
    health.mockResolvedValue(false);
    renderGate();
    expect(screen.getByTestId('workspace')).toBeInTheDocument();
    await flush(2000);
    expect(health).not.toHaveBeenCalled();
    expect(screen.queryByTestId('wake-card')).toBeNull();
  });

  it('aborts the in-flight probe on unmount', async () => {
    let captured: AbortSignal | undefined;
    health.mockImplementation((signal) => {
      captured = signal;
      return new Promise(() => undefined);
    });
    const view = renderGate();
    await flush(0);
    expect(captured?.aborted).toBe(false);
    view.unmount();
    expect(captured?.aborted).toBe(true);
  });
});
