import { Request, Response } from 'express';
import { ApiSuccessEnvelope, ErrorCode, TopicSessionDTO } from '@mentora/shared';
import { interactService, InteractService } from '../services/interact.service.js';
import { releasePendingReservation } from '../middlewares/quota.middleware.js';
import { SseWriter } from '../utils/sse.helper.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../config/logger.js';
import { extractSessionId } from '../utils/request.js';

export class InteractController {
  constructor(private readonly service: InteractService = interactService) {}

  initInteract = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<TopicSessionDTO>>
  ): Promise<void> => {
    const sessionId = extractSessionId(req);
    const result = await this.service.initializeInteract(
      req.user,
      sessionId,
      req.quotaReservation
    );
    const quotaMeta = result.quota ?? req.quota;

    res.status(200).json({
      success: true,
      data: result.session,
      ...(quotaMeta ? { meta: { quota: quotaMeta } } : {}),
    });
  };

  streamInteractTurn = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const sessionId = extractSessionId(req);
    const userId = req.user?.id;

    // Validate prerequisites (throws standard operational AppError before flushing SSE headers)
    await this.service.validateTurnPreconditions(req.user, sessionId);

    // Establish unbuffered SSE stream
    const sseWriter = new SseWriter(res);

    try {
      await this.service.processTurnStream(
        req.user,
        sessionId,
        req.body,
        sseWriter,
        req.quotaReservation
      );
    } catch (err) {
      // Headers are already flushed: report through the stream, never via JSON.
      logger.error({ err, sessionId, userId }, 'Unhandled error during Interact SSE turn');
      await releasePendingReservation(req.quotaReservation);
      sseWriter.sendError({
        code: err instanceof AppError ? err.errorCode : ErrorCode.INTERNAL_SERVER_ERROR,
        message:
          err instanceof AppError && err.statusCode < 500
            ? err.message
            : 'Something went wrong while generating the reply. Please retry.',
      });
    } finally {
      sseWriter.close();
    }
  };
}

export const interactController = new InteractController();

