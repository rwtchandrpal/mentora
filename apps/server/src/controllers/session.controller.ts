import { Request, Response } from 'express';
import {
  ApiSuccessEnvelope,
  SessionSummaryDTO,
  TopicSessionDTO,
} from '@mentora/shared';
import { sessionService, SessionService } from '../services/session.service.js';
import { signGuestToken } from '../services/auth.service.js';
import { extractSessionId } from '../utils/request.js';

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
    const userId = req.user?.id;
    const result = await this.service.createSession(req.user, req.body, req.quotaReservation);
    const data = result.session;
    const quotaMeta = result.quota ?? req.quota;
    const guestToken = userId ? undefined : signGuestToken(data.id);
    const meta = {
      ...(quotaMeta ? { quota: quotaMeta } : {}),
      ...(guestToken ? { guestToken } : {}),
    };
    res.status(201).json({
      success: true,
      data,
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
    });
  };

  getSessionById = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<TopicSessionDTO>>
  ): Promise<void> => {
    const sessionId = extractSessionId(req);
    const data = await this.service.getSessionById(req.user?.id, sessionId);
    res.status(200).json({
      success: true,
      data,
    });
  };

  switchMode = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<TopicSessionDTO>>
  ): Promise<void> => {
    const sessionId = extractSessionId(req);
    const data = await this.service.switchMode(
      req.user?.id,
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
    const sessionId = extractSessionId(req);
    const data = await this.service.deleteSession(req.user?.id, sessionId);
    res.status(200).json({
      success: true,
      data,
    });
  };
}

export const sessionController = new SessionController();

