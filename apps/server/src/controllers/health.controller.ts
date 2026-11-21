import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { ApiErrorEnvelope, ApiSuccessEnvelope, ErrorCode } from '@mentora/shared';

export interface HealthCheckData {
  status: 'ok' | 'degraded';
  db: boolean;
  uptime: number;
}

/** Mongoose `readyState` 1 means connected. */
const MONGOOSE_CONNECTED = 1;

/**
 * Cheap liveness + DB readiness probe (A-29). Reads the in-memory connection
 * state only; it never issues a query.
 */
export const getHealth = (
  _req: Request,
  res: Response<ApiSuccessEnvelope<HealthCheckData> | ApiErrorEnvelope>
): void => {
  const db = mongoose.connection.readyState === MONGOOSE_CONNECTED;
  const uptime = process.uptime();

  if (!db) {
    res.status(503).json({
      success: false,
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Database unavailable',
        details: { status: 'degraded', db, uptime },
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: { status: 'ok', db, uptime },
  });
};
