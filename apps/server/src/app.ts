import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { GUEST_TOKEN_HEADER } from '@mentora/shared';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { profileRouter } from './routes/profile.routes.js';
import { sessionRouter } from './routes/session.routes.js';
import { quotaRouter } from './routes/quota.routes.js';
import { notFoundMiddleware, errorMiddleware } from './middlewares/error.middleware.js';
import {
  createApiRateLimiter,
  createAuthRateLimiter,
  DEFAULT_AUTH_RATE_LIMIT,
  RateLimitOptions,
} from './middlewares/rateLimit.middleware.js';
import { createClientIpDiagnostics, getClientIp } from './utils/clientIp.js';

export interface CreateAppOptions {
  /**
   * Login/register limiter settings. Rate limiters are off under NODE_ENV=test; passing
   * this enables the auth limiter there too, so tests can exercise it.
   */
  authRateLimit?: RateLimitOptions;
}

export const createApp = (
  customRoutes?: (app: Express) => void,
  options: CreateAppOptions = {}
): Express => {
  const app = express();

  // Hop count must match the hosting platform (M-04); see TRUST_PROXY in .env.example.
  // CLIENT_IP_HEADER, when set, takes precedence for quota and rate-limit keys.
  app.set('trust proxy', env.TRUST_PROXY);

  if (env.LOG_CLIENT_IP_DIAGNOSTICS) {
    app.use(createClientIpDiagnostics(getClientIp));
  }

  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', GUEST_TOKEN_HEADER],
    })
  );

  const apiLimiter = createApiRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: env.NODE_ENV === 'test' ? 10000 : 100,
    skip: () => env.NODE_ENV === 'test',
  });
  app.use('/api', apiLimiter);

  app.use(express.json({ limit: '100kb' }));

  // Dedicated brute-force limiter for credential endpoints (A-15). Runs after the JSON
  // parser because it is keyed by IP + email.
  if (options.authRateLimit || env.NODE_ENV !== 'test') {
    const authLimiter = createAuthRateLimiter(options.authRateLimit ?? DEFAULT_AUTH_RATE_LIMIT);
    app.post(['/api/v1/auth/login', '/api/v1/auth/register'], authLimiter);
  }

  app.use('/api/v1', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/profile', profileRouter);
  app.use('/api/v1/quota', quotaRouter);
  // The explain/interact/practice routers are mounted inside sessionRouter, which applies
  // auth, profile and per-session access checks once for all of them (A-13).
  app.use('/api/v1/sessions', sessionRouter);

  if (customRoutes) {
    customRoutes(app);
  }

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
};

export const app = createApp();
export default app;
