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
import { GuestQuota } from '../models/GuestQuota.model.js';

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

const GUEST_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Identifies a guest by client IP. `req.ip` is resolved by Express using the
 * `trust proxy` setting in app.ts (one hop on Render), so the client cannot choose it.
 * Never read X-Forwarded-For directly: its left-most entries are client-controlled.
 */
export const getGuestIdentifier = (req: Request): string => {
  return req.ip || req.socket.remoteAddress || 'unknown-guest';
};

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  'code' in err &&
  (err as { code: unknown }).code === 11000;

/**
 * Returns the guest's current quota window, starting a new one if none exists or the
 * previous window has ended. Persisted in MongoDB so it survives restarts and is shared
 * across instances.
 */
export const syncGuestQuotaWindow = async (
  guestId: string,
  now: Date = new Date()
): Promise<GuestQuotaRecord> => {
  const nextReset = new Date(now.getTime() + GUEST_QUOTA_WINDOW_MS);

  // Roll over an expired window (the TTL monitor may not have removed it yet).
  const rolled = await GuestQuota.findOneAndUpdate(
    { _id: guestId, windowResetAt: { $lte: now } },
    { $set: { count: 0, windowResetAt: nextReset } },
    { returnDocument: 'after' }
  )
    .lean()
    .exec();
  if (rolled) {
    return { count: rolled.count, windowResetAt: rolled.windowResetAt };
  }

  try {
    const current = await GuestQuota.findOneAndUpdate(
      { _id: guestId },
      { $setOnInsert: { count: 0, windowResetAt: nextReset } },
      { upsert: true, returnDocument: 'after' }
    )
      .lean()
      .exec();
    return { count: current!.count, windowResetAt: current!.windowResetAt };
  } catch (err) {
    // Two concurrent first requests for the same guest: the loser re-reads.
    if (isDuplicateKeyError(err)) {
      const existing = await GuestQuota.findById(guestId).lean().exec();
      if (existing) {
        return { count: existing.count, windowResetAt: existing.windowResetAt };
      }
    }
    throw err;
  }
};

export const incrementGuestQuota = async (
  guestId: string,
  now: Date = new Date()
): Promise<QuotaMetaDTO> => {
  await syncGuestQuotaWindow(guestId, now);
  const updated = await GuestQuota.findOneAndUpdate(
    { _id: guestId },
    { $inc: { count: 1 } },
    { returnDocument: 'after' }
  )
    .lean()
    .exec();
  if (!updated) {
    throw new AppError(500, ErrorCode.INTERNAL_SERVER_ERROR, 'Guest quota record missing');
  }
  return toQuotaMetaDTO(
    { dailyCount: updated.count, windowResetAt: updated.windowResetAt },
    GUEST_DAILY_AI_QUOTA_LIMIT
  );
};

export const clearGuestQuotaStore = async (): Promise<void> => {
  await GuestQuota.deleteMany({}).exec();
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
    const guestUsage = await syncGuestQuotaWindow(guestId);

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
