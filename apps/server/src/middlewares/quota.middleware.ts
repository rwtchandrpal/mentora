import { Request, Response, NextFunction } from 'express';
import { QuotaMetaDTO, ErrorCode, QuotaMetaSchema } from '@mentora/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { userRepository } from '../repositories/user.repository.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      quota?: QuotaMetaDTO;
    }
  }
}

export const toQuotaMetaDTO = (
  usageQuota: { dailyCount: number; windowResetAt: Date },
  limit: number = env.DAILY_AI_QUOTA_LIMIT
): QuotaMetaDTO => {
  const dto: QuotaMetaDTO = {
    used: usageQuota.dailyCount,
    limit,
    resetAt: usageQuota.windowResetAt.toISOString(),
  };
  return QuotaMetaSchema.parse(dto);
};

export const requireAiQuota = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
    }

    const user = await userRepository.syncQuotaWindow(req.user.id);
    if (!user) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'User account not found');
    }

    if (user.usageQuota.dailyCount >= env.DAILY_AI_QUOTA_LIMIT) {
      throw new AppError(
        429,
        ErrorCode.DAILY_QUOTA_EXCEEDED,
        `You have reached your daily limit of ${env.DAILY_AI_QUOTA_LIMIT} tutor actions. You can still review all saved sessions.`,
        {
          resetAt: user.usageQuota.windowResetAt.toISOString(),
          used: user.usageQuota.dailyCount,
          limit: env.DAILY_AI_QUOTA_LIMIT,
        }
      );
    }

    req.quota = toQuotaMetaDTO(user.usageQuota);
    next();
  } catch (error) {
    next(error);
  }
};

export const quotaMiddleware = requireAiQuota;

export const incrementUserQuota = async (
  userId: string,
  now: Date = new Date()
): Promise<QuotaMetaDTO> => {
  const user = await userRepository.incrementQuotaCount(userId, now);
  if (!user) {
    throw new AppError(404, ErrorCode.RESOURCE_NOT_FOUND, 'User not found');
  }
  return toQuotaMetaDTO(user.usageQuota);
};
