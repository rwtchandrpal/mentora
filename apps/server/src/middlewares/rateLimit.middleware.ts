import { Request, Response, RequestHandler } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { ErrorCode, type ApiErrorEnvelope } from '@mentora/shared';
import { getClientIp, type ClientIpResolver } from '../utils/clientIp.js';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

/** Default for the login/register limiter (A-15). */
export const DEFAULT_AUTH_RATE_LIMIT: RateLimitOptions = {
  limit: 10,
  windowMs: FIFTEEN_MINUTES_MS,
};

const sendRateLimitExceeded =
  (message: string) => (_req: Request, res: Response<ApiErrorEnvelope>) => {
    res.status(429).json({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message,
      },
    });
  };

export const createApiRateLimiter = (
  options: RateLimitOptions & { skip: () => boolean; clientIp?: ClientIpResolver }
): RequestHandler => {
  const clientIp = options.clientIp ?? getClientIp;
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: options.skip,
    // Same client key as guest quotas (LIVE-BUG-H2): CLIENT_IP_HEADER, else req.ip.
    keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
    handler: sendRateLimitExceeded('Too many requests from this IP, please try again later.'),
  });
};

const normalizedEmailOf = (req: Request): string => {
  const email: unknown = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
};

/**
 * Brute-force guard for /auth/login and /auth/register, keyed by client IP plus the
 * normalised email, so one attacker cannot hammer one account. Must run after
 * `express.json()` so the email is available.
 */
export const createAuthRateLimiter = (
  options: RateLimitOptions & { clientIp?: ClientIpResolver }
): RequestHandler => {
  const clientIp = options.clientIp ?? getClientIp;
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(clientIp(req))}|${normalizedEmailOf(req)}`,
    handler: sendRateLimitExceeded('Too many sign-in attempts, please try again later.'),
  });
};
