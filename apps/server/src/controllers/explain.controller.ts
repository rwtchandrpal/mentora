import { Request, Response } from 'express';
import { ApiSuccessEnvelope, TopicSessionDTO } from '@mentora/shared';
import { explainService, ExplainService } from '../services/explain.service.js';
import { userRepository } from '../repositories/user.repository.js';
import { toQuotaMetaDTO } from '../middlewares/quota.middleware.js';

const extractSessionId = (req: Request): string => {
  const param = req.params.sessionId ?? req.params.id;
  if (Array.isArray(param)) {
    return param[0] ?? '';
  }
  return param ?? '';
};

export class ExplainController {
  constructor(private readonly service: ExplainService = explainService) {}

  initExplain = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<TopicSessionDTO>>
  ): Promise<void> => {
    const sessionId = extractSessionId(req);
    const data = await this.service.initializeExplain(req.user!.id, sessionId);

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

  stepExplain = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<TopicSessionDTO>>
  ): Promise<void> => {
    const sessionId = extractSessionId(req);
    const stepIndex =
      req.body.stepIndex !== undefined
        ? req.body.stepIndex
        : req.body.currentStepIndex;

    const data = await this.service.advanceStep(
      req.user!.id,
      sessionId,
      stepIndex
    );

    res.status(200).json({
      success: true,
      data,
    });
  };

  deeperExplain = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<TopicSessionDTO>>
  ): Promise<void> => {
    const sessionId = extractSessionId(req);
    const stepNumber = req.body.stepNumber;

    const data = await this.service.generateDeepDive(
      req.user!.id,
      sessionId,
      stepNumber
    );

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
}

export const explainController = new ExplainController();

