import { Request, Response } from 'express';
import { ApiSuccessEnvelope, TopicSessionDTO } from '@mentora/shared';
import { practiceService, PracticeService } from '../services/practice.service.js';
import { userRepository } from '../repositories/user.repository.js';
import { toQuotaMetaDTO } from '../middlewares/quota.middleware.js';

const extractSessionId = (req: Request): string => {
  const param = req.params.sessionId ?? req.params.id;
  if (Array.isArray(param)) {
    return param[0] ?? '';
  }
  return param ?? '';
};

export class PracticeController {
  constructor(private readonly service: PracticeService = practiceService) {}

  generateBatch = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<TopicSessionDTO>>
  ): Promise<void> => {
    const sessionId = extractSessionId(req);
    const { tier } = req.body;
    const data = await this.service.generateBatch(req.user!.id, sessionId, tier);

    let quotaMeta = req.quota;
    const user = await userRepository.findById(req.user!.id);
    if (user) {
      quotaMeta = toQuotaMetaDTO(user.usageQuota);
    }

    res.status(200).json({
      success: true,
      data,
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
      req.user!.id,
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

