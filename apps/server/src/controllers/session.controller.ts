import { Request, Response } from 'express';
import {
  ApiSuccessEnvelope,
  SessionSummaryDTO,
  TopicSessionDTO,
} from '@mentora/shared';
import { sessionService, SessionService } from '../services/session.service.js';
import { userRepository } from '../repositories/user.repository.js';
import { toQuotaMetaDTO } from '../middlewares/quota.middleware.js';

const extractParamId = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) {
    return param[0] ?? '';
  }
  return param ?? '';
};

export class SessionController {
  constructor(private readonly service: SessionService = sessionService) {}

  listSessions = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<SessionSummaryDTO[]>>
  ): Promise<void> => {
    const data = await this.service.listSessions(req.user!.id);
    res.status(200).json({
      success: true,
      data,
    });
  };

  createSession = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<TopicSessionDTO>>
  ): Promise<void> => {
    const data = await this.service.createSession(req.user!.id, req.body);
    let quotaMeta = req.quota;
    const user = await userRepository.findById(req.user!.id);
    if (user) {
      quotaMeta = toQuotaMetaDTO(user.usageQuota);
    }
    res.status(201).json({
      success: true,
      data,
      ...(quotaMeta ? { meta: { quota: quotaMeta } } : {}),
    });
  };

  getSessionById = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<TopicSessionDTO>>
  ): Promise<void> => {
    const sessionId = extractParamId(req.params.id);
    const data = await this.service.getSessionById(req.user!.id, sessionId);
    res.status(200).json({
      success: true,
      data,
    });
  };

  switchMode = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<TopicSessionDTO>>
  ): Promise<void> => {
    const sessionId = extractParamId(req.params.id);
    const data = await this.service.switchMode(
      req.user!.id,
      sessionId,
      req.body.mode
    );
    res.status(200).json({
      success: true,
      data,
    });
  };

  deleteSession = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<{ deletedId: string }>>
  ): Promise<void> => {
    const sessionId = extractParamId(req.params.id);
    const data = await this.service.deleteSession(req.user!.id, sessionId);
    res.status(200).json({
      success: true,
      data,
    });
  };
}

export const sessionController = new SessionController();

