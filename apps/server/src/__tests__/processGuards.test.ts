import { describe, it, expect, vi } from 'vitest';
import { installProcessGuards, memorySnapshotMb } from '../config/processGuards.js';

type Listener = (arg: unknown) => void;

const makeFakeProcess = () => {
  const listeners = new Map<string, Listener>();
  const exit = vi.fn();
  return {
    listeners,
    exit,
    proc: {
      on: (event: string, listener: Listener) => {
        listeners.set(event, listener);
      },
      exit,
    },
  };
};

describe('LIVE-FIX-004: process guards log the cause before exiting', () => {
  it('logs an unhandled rejection as fatal with memory, then exits with code 1', () => {
    const { listeners, exit, proc } = makeFakeProcess();
    const fatal = vi.fn();
    installProcessGuards(proc as never, { fatal } as never);

    const reason = new Error('db write rejected');
    listeners.get('unhandledRejection')?.(reason);

    expect(fatal).toHaveBeenCalledTimes(1);
    const [context, message] = fatal.mock.calls[0] as [Record<string, unknown>, string];
    expect(context.err).toBe(reason);
    expect(context.kind).toBe('unhandledRejection');
    expect(context.memory).toMatchObject({ rssMb: expect.any(Number) });
    expect(message).toMatch(/unhandled promise rejection/i);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('logs an uncaught exception as fatal, then exits with code 1', () => {
    const { listeners, exit, proc } = makeFakeProcess();
    const fatal = vi.fn();
    installProcessGuards(proc as never, { fatal } as never);

    const error = new TypeError('boom');
    listeners.get('uncaughtException')?.(error);

    const [context] = fatal.mock.calls[0] as [Record<string, unknown>];
    expect(context.err).toBe(error);
    expect(context.kind).toBe('uncaughtException');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('reports memory in MB', () => {
    const snapshot = memorySnapshotMb();
    expect(Object.keys(snapshot)).toEqual(['rssMb', 'heapUsedMb', 'heapTotalMb', 'externalMb']);
    expect(snapshot.rssMb).toBeGreaterThan(0);
  });
});
