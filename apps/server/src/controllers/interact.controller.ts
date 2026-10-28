import { Request, Response } from 'express';
import { ApiSuccessEnvelope, TopicSessionDTO } from '@mentora/shared';
import { interactService, InteractService } from '../services/interact.service.js';
import { userRepository } from '../repositories/user.repository.js';
import { toQuotaMetaDTO } from '../middlewares/quota.middleware.js';
import { SseWriter } from '../utils/sse.helper.js';

const extractSessionId = (req: Request): string => {
  const param = req.params.sessionId ?? req.params.id;
  if (Array.isArray(param)) {
    return param[0] ?? '';
  }
  return param ?? '';
};

export class InteractController {
  constructor(private readonly service: InteractService = interactService) {}

  initInteract = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<TopicSessionDTO>>
  ): Promise<void> => {
    const sessionId = extractSessionId(req);
    const result = await this.service.initializeInteract(req.user!.id, sessionId);

    let quotaMeta = req.quota;
    const user = await userRepository.findById(req.user!.id);
    if (user) {
      quotaMeta = toQuotaMetaDTO(user.usageQuota);
    }

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

    // Validate prerequisites (throws standard operational AppError before flushing SSE headers)
    await this.service.validateTurnPreconditions(req.user!.id, sessionId);

    // Establish unbuffered SSE stream
    const sseWriter = new SseWriter(res);

    try {
      await this.service.processTurnStream(
        req.user!.id,
        sessionId,
        req.body,
        sseWriter
      );
    } finally {
      sseWriter.close();
    }
  };
}

export const interactController = new InteractController();

