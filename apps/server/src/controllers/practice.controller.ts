import { Request, Response } from 'express';
import { ApiSuccessEnvelope, TopicSessionDTO } from '@mentora/shared';
import { practiceService, PracticeService } from '../services/practice.service.js';
import { extractSessionId } from '../utils/request.js';

export class PracticeController {
  constructor(private readonly service: PracticeService = practiceService) {}

  generateBatch = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<TopicSessionDTO>>
  ): Promise<void> => {
    const sessionId = extractSessionId(req);
    const { tier } = req.body;
    const result = await this.service.generateBatch(
      req.user,
      sessionId,
      tier,
      req.quotaReservation
    );
    const quotaMeta = result.quota ?? req.quota;

    res.status(200).json({
      success: true,
      data: result.session,
      ...(quotaMeta ? { meta: { quota: quotaMeta } } : {}),
    });
  };

  submitBatch = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<TopicSessionDTO>>
  ): Promise<void> => {
    const sessionId = extractSessionId(req);
    const { tier, answers } = req.body;
    const data = await this.service.submitBatch(
      req.user?.id,
      sessionId,
      tier,
      answers
    );

    res.status(200).json({
      success: true,
      data,
    });
  };
}

export const practiceController = new PracticeController();

