import { Request, Response, NextFunction } from 'express';
import {
  QuotaMetaDTO,
  ErrorCode,
  QuotaMetaSchema,
  GUEST_DAILY_AI_QUOTA_LIMIT,
} from '@mentora/shared';
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

export interface GuestQuotaRecord {
  count: number;
  windowResetAt: Date;
}

const guestQuotaStore = new Map<string, GuestQuotaRecord>();

export const getGuestIdentifier = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown-guest';
};

export const syncGuestQuotaWindow = (
  guestId: string,
  now: Date = new Date()
): GuestQuotaRecord => {
  let record = guestQuotaStore.get(guestId);
  if (!record || now >= record.windowResetAt) {
    const windowResetAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    record = { count: 0, windowResetAt };
    guestQuotaStore.set(guestId, record);
  }
  return record;
};

export const incrementGuestQuota = (
  guestId: string,
  now: Date = new Date()
): QuotaMetaDTO => {
  const record = syncGuestQuotaWindow(guestId, now);
  record.count += 1;
  guestQuotaStore.set(guestId, record);
  return toQuotaMetaDTO(
    { dailyCount: record.count, windowResetAt: record.windowResetAt },
    GUEST_DAILY_AI_QUOTA_LIMIT
  );
};

export const clearGuestQuotaStore = (): void => {
  guestQuotaStore.clear();
};

export const requireAiQuota = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user) {
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
      return next();
    }

    // Guest Mode Quota Check
    const guestId = getGuestIdentifier(req);
    const guestUsage = syncGuestQuotaWindow(guestId);

    if (guestUsage.count >= GUEST_DAILY_AI_QUOTA_LIMIT) {
      throw new AppError(
        429,
        ErrorCode.DAILY_QUOTA_EXCEEDED,
        `You have reached your daily guest limit of ${GUEST_DAILY_AI_QUOTA_LIMIT} tutor actions. Please sign in or register to get ${env.DAILY_AI_QUOTA_LIMIT} daily actions and save your progress.`,
        {
          resetAt: guestUsage.windowResetAt.toISOString(),
          used: guestUsage.count,
          limit: GUEST_DAILY_AI_QUOTA_LIMIT,
        }
      );
    }

    req.quota = toQuotaMetaDTO(
      { dailyCount: guestUsage.count, windowResetAt: guestUsage.windowResetAt },
      GUEST_DAILY_AI_QUOTA_LIMIT
    );
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
