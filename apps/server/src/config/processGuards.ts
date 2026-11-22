import type { Logger } from 'pino';
import { logger as defaultLogger } from './logger.js';

/** Process memory in MB, for logs that help explain restarts on small instances. */
export const memorySnapshotMb = (): Record<string, number> => {
  const { rss, heapUsed, heapTotal, external } = process.memoryUsage();
  const toMb = (bytes: number): number => Math.round((bytes / 1024 / 1024) * 10) / 10;
  return {
    rssMb: toMb(rss),
    heapUsedMb: toMb(heapUsed),
    heapTotalMb: toMb(heapTotal),
    externalMb: toMb(external),
  };
};

interface ProcessLike {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
  on(event: 'uncaughtException', listener: (error: Error) => void): unknown;
  exit(code?: number): never;
}

/**
 * Logs why the process is about to die before it dies (LIVE-BUG-H4).
 *
 * Production restarted twice within 15 minutes with nothing in the app's own logs,
 * because Node's default handling of an uncaught error or unhandled rejection prints
 * a bare stack trace and exits. These handlers keep that exit (continuing after an
 * uncaught exception leaves the process in an unknown state) but write a structured
 * fatal log with the error and current memory first, so Render's logs show the cause.
 */
export const installProcessGuards = (
  proc: ProcessLike = process,
  log: Pick<Logger, 'fatal'> = defaultLogger
): void => {
  proc.on('unhandledRejection', (reason: unknown) => {
    log.fatal(
      { err: reason, memory: memorySnapshotMb(), kind: 'unhandledRejection' },
      'Unhandled promise rejection, exiting'
    );
    proc.exit(1);
  });

  proc.on('uncaughtException', (error: Error) => {
    log.fatal(
      { err: error, memory: memorySnapshotMb(), kind: 'uncaughtException' },
      'Uncaught exception, exiting'
    );
    proc.exit(1);
  });
};
