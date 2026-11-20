import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiErrorEnvelope, ErrorCode } from '@mentora/shared';
import { AppError } from '../utils/AppError.js';
import { logger } from '../config/logger.js';
import { releasePendingReservation } from './quota.middleware.js';

export const notFoundMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  next(
    new AppError(
      404,
      ErrorCode.RESOURCE_NOT_FOUND,
      `Cannot ${req.method} ${req.originalUrl}`
    )
  );
};

export const errorMiddleware = (
  err: unknown,
  req: Request,
  res: Response<ApiErrorEnvelope>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  // A failed AI request must not keep the quota unit it reserved (A-06). Release it
  // before responding so the client never observes a stale count.
  const reservation = req.quotaReservation;
  if (reservation?.isPending) {
    void releasePendingReservation(reservation).finally(() => sendError(err, res));
    return;
  }
  sendError(err, res);
};

const sendError = (err: unknown, res: Response<ApiErrorEnvelope>): void => {
  // Streaming responses (SSE) flush headers early. Writing a JSON envelope at
  // that point would throw ERR_HTTP_HEADERS_SENT, so log and close instead.
  if (res.headersSent) {
    logger.error({ err }, 'Error raised after response headers were sent');
    if (!res.writableEnded) {
      res.end();
    }
    return;
  }

  if (err instanceof AppError) {
    const response: ApiErrorEnvelope = {
      success: false,
      error: {
        code: err.errorCode,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  if (err instanceof ZodError) {
    const response: ApiErrorEnvelope = {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid request payload',
        details: { issues: err.issues },
      },
    };
    res.status(400).json(response);
    return;
  }

  logger.error({ err }, 'Unhandled server error');

  const response: ApiErrorEnvelope = {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'An unexpected internal server error occurred',
    },
  };
  res.status(500).json(response);
};
