import { Request, Response } from 'express';
import { ApiSuccessEnvelope, ExplainStepRequestDTO, TopicSessionDTO } from '@mentora/shared';
import { explainService, ExplainService } from '../services/explain.service.js';
import { extractSessionId } from '../utils/request.js';

export class ExplainController {
  constructor(private readonly service: ExplainService = explainService) {}

  initExplain = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<TopicSessionDTO>>
  ): Promise<void> => {
    const sessionId = extractSessionId(req);
    const result = await this.service.initializeExplain(
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

  stepExplain = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<TopicSessionDTO>>
  ): Promise<void> => {
    const sessionId = extractSessionId(req);
    const { stepIndex } = req.body as ExplainStepRequestDTO;

    const data = await this.service.advanceStep(
      req.user?.id,
      sessionId,
      stepIndex
    );

    res.status(200).json({
      success: true,
      data,
    });
  };

}

export const explainController = new ExplainController();

