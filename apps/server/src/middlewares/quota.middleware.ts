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
import { logger } from '../config/logger.js';
import { getClientIp } from '../utils/clientIp.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      quota?: QuotaMetaDTO;
      quotaReservation?: QuotaReservation;
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
 * Identifies a guest by client IP, via the shared resolver also used by the rate
 * limiters: CLIENT_IP_HEADER when configured and valid, else `req.ip` (Express
 * `trust proxy`). Never read X-Forwarded-For directly: its left-most entries are
 * client-controlled.
 */
export const getGuestIdentifier = (req: Request): string => getClientIp(req);

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

/**
 * Atomically reserves one guest quota unit if the guest is under `limit`.
 * Returns null when the limit is reached.
 */
export const tryReserveGuestQuota = async (
  guestId: string,
  limit: number = GUEST_DAILY_AI_QUOTA_LIMIT,
  now: Date = new Date()
): Promise<GuestQuotaRecord | null> => {
  await syncGuestQuotaWindow(guestId, now);
  const updated = await GuestQuota.findOneAndUpdate(
    { _id: guestId, count: { $lt: limit } },
    { $inc: { count: 1 } },
    { returnDocument: 'after' }
  )
    .lean()
    .exec();
  return updated ? { count: updated.count, windowResetAt: updated.windowResetAt } : null;
};

/** Gives back one reserved guest unit in the window it was reserved in, floored at 0. */
export const releaseGuestQuota = async (
  guestId: string,
  windowResetAt: Date
): Promise<GuestQuotaRecord | null> => {
  const released = await GuestQuota.findOneAndUpdate(
    { _id: guestId, count: { $gt: 0 }, windowResetAt },
    { $inc: { count: -1 } },
    { returnDocument: 'after' }
  )
    .lean()
    .exec();
  const record = released ?? (await GuestQuota.findById(guestId).lean().exec());
  return record ? { count: record.count, windowResetAt: record.windowResetAt } : null;
};

export type QuotaPayer =
  | { kind: 'user'; userId: string }
  | { kind: 'guest'; guestId: string };

/**
 * One quota unit reserved up front by `requireAiQuota` (A-06, A-07).
 *
 * Reserving before the AI call makes the limit check atomic. The unit is only kept
 * when the AI work actually ran and was saved: the service calls `commit()` on
 * success and `release()` on the idempotent path or when it lost a concurrent
 * race. Thrown errors are released by the error middleware, and any reservation
 * still pending when the response closes is released as a safety net.
 * Both methods are idempotent; whichever runs first wins.
 */
export class QuotaReservation {
  private state: 'reserved' | 'committed' | 'released' = 'reserved';

  constructor(
    readonly payer: QuotaPayer,
    private meta: QuotaMetaDTO,
    private readonly windowResetAt: Date
  ) {}

  get isPending(): boolean {
    return this.state === 'reserved';
  }

  /** Quota as of the reservation (includes the reserved unit). */
  get quota(): QuotaMetaDTO {
    return this.meta;
  }

  commit(): QuotaMetaDTO {
    if (this.state === 'reserved') {
      this.state = 'committed';
    }
    return this.meta;
  }

  async release(): Promise<QuotaMetaDTO> {
    if (this.state !== 'reserved') {
      return this.meta;
    }
    this.state = 'released';

    if (this.payer.kind === 'user') {
      const user = await userRepository.releaseQuota(this.payer.userId, this.windowResetAt);
      this.meta = user
        ? toQuotaMetaDTO(user.usageQuota)
        : { ...this.meta, used: Math.max(0, this.meta.used - 1) };
    } else {
      const record = await releaseGuestQuota(this.payer.guestId, this.windowResetAt);
      this.meta = record
        ? toQuotaMetaDTO(
            { dailyCount: record.count, windowResetAt: record.windowResetAt },
            GUEST_DAILY_AI_QUOTA_LIMIT
          )
        : { ...this.meta, used: Math.max(0, this.meta.used - 1) };
    }
    return this.meta;
  }
}

/**
 * Releases a reservation that is still pending, logging (not throwing) on failure.
 * Used on error paths where the original error must still be reported.
 */
export const releasePendingReservation = async (
  reservation: QuotaReservation | undefined
): Promise<void> => {
  if (!reservation?.isPending) {
    return;
  }
  try {
    await reservation.release();
  } catch (err) {
    logger.error({ err, payer: reservation.payer }, 'Failed to release reserved AI quota');
  }
};

const reserveUserQuota = async (userId: string): Promise<QuotaReservation> => {
  const reserved = await userRepository.tryReserveQuota(userId, env.DAILY_AI_QUOTA_LIMIT);
  if (!reserved) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'User account not found');
    }
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
  return new QuotaReservation(
    { kind: 'user', userId },
    toQuotaMetaDTO(reserved.usageQuota),
    reserved.usageQuota.windowResetAt
  );
};

const reserveGuestQuota = async (guestId: string): Promise<QuotaReservation> => {
  const reserved = await tryReserveGuestQuota(guestId, GUEST_DAILY_AI_QUOTA_LIMIT);
  if (!reserved) {
    const current = await syncGuestQuotaWindow(guestId);
    throw new AppError(
      429,
      ErrorCode.DAILY_QUOTA_EXCEEDED,
      `You have reached your daily guest limit of ${GUEST_DAILY_AI_QUOTA_LIMIT} tutor actions. Please sign in or register to get ${env.DAILY_AI_QUOTA_LIMIT} daily actions and save your progress.`,
      {
        resetAt: current.windowResetAt.toISOString(),
        used: current.count,
        limit: GUEST_DAILY_AI_QUOTA_LIMIT,
      }
    );
  }
  return new QuotaReservation(
    { kind: 'guest', guestId },
    toQuotaMetaDTO(
      { dailyCount: reserved.count, windowResetAt: reserved.windowResetAt },
      GUEST_DAILY_AI_QUOTA_LIMIT
    ),
    reserved.windowResetAt
  );
};

export const requireAiQuota = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const reservation = req.user
      ? await reserveUserQuota(req.user.id)
      : await reserveGuestQuota(getGuestIdentifier(req));

    req.quotaReservation = reservation;
    req.quota = reservation.quota;

    // Safety net: a reservation that nobody committed is never kept.
    res.once('close', () => {
      void releasePendingReservation(reservation);
    });

    next();
  } catch (error) {
    next(error);
  }
};

export const quotaMiddleware = requireAiQuota;
