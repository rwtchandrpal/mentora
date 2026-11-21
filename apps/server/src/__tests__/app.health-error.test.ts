import { describe, it, expect, vi, afterEach } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import express, { Request, Response } from 'express';
import { z } from 'zod';
import { ErrorCode } from '@mentora/shared';
import { env, parseEnv, resolveRawEnv } from '../config/env.js';
import { app, createApp } from '../app.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { notFoundMiddleware, errorMiddleware } from '../middlewares/error.middleware.js';

describe('IMP-004: Server Bootstrap, Config, Logger, & Error Handling', () => {
  describe('1. Environment Configuration Validation (parseEnv)', () => {
    const validRawEnv: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      PORT: '5000',
      MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/mentora',
      JWT_SECRET: 'this-is-a-valid-jwt-secret-with-more-than-32-characters',
      JWT_EXPIRES_IN: '7d',
      CLIENT_ORIGIN: 'https://mentora.vercel.app',
      GEMINI_API_KEY: 'test-google-ai-studio-api-key',
      GEMINI_FAST_MODEL: 'gemini-3.5-flash-lite',
      GEMINI_REASONING_MODEL: 'gemini-3.6-pro',
      DAILY_AI_QUOTA_LIMIT: '50',
    };

    it('successfully parses and coerces valid environment variables', () => {
      const parsed = parseEnv(validRawEnv);
      expect(parsed.NODE_ENV).toBe('production');
      expect(parsed.PORT).toBe(5000);
      expect(parsed.MONGODB_URI).toBe('mongodb+srv://user:pass@cluster.mongodb.net/mentora');
      expect(parsed.JWT_SECRET).toBe('this-is-a-valid-jwt-secret-with-more-than-32-characters');
      expect(parsed.JWT_EXPIRES_IN).toBe('7d');
      expect(parsed.CLIENT_ORIGIN).toBe('https://mentora.vercel.app');
      expect(parsed.GEMINI_API_KEY).toBe('test-google-ai-studio-api-key');
      expect(parsed.GEMINI_FAST_MODEL).toBe('gemini-3.5-flash-lite');
      expect(parsed.GEMINI_REASONING_MODEL).toBe('gemini-3.6-pro');
      expect(parsed.DAILY_AI_QUOTA_LIMIT).toBe(50);
    });

    it('throws validation error when MONGODB_URI is missing or empty', () => {
      const invalidEnv = { ...validRawEnv, MONGODB_URI: '' };
      expect(() => parseEnv(invalidEnv)).toThrow();
    });

    it('throws validation error when GEMINI_API_KEY is missing or empty', () => {
      const invalidEnv = { ...validRawEnv, GEMINI_API_KEY: '' };
      expect(() => parseEnv(invalidEnv)).toThrow();
    });

    it('throws validation error when CLIENT_ORIGIN is not a valid URL', () => {
      const invalidEnv = { ...validRawEnv, CLIENT_ORIGIN: 'not-a-valid-url' };
      expect(() => parseEnv(invalidEnv)).toThrow();
    });

    it('throws validation error when JWT_SECRET is shorter than 32 characters', () => {
      const invalidEnv = { ...validRawEnv, JWT_SECRET: 'short-secret-under-32-chars' };
      expect(() => parseEnv(invalidEnv)).toThrow();
    });

    it('TRUST_PROXY defaults to 1 hop, accepts a numeric override, and rejects non-integers (M-04)', () => {
      expect(parseEnv(validRawEnv).TRUST_PROXY).toBe(1);
      expect(parseEnv({ ...validRawEnv, TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
      expect(() => parseEnv({ ...validRawEnv, TRUST_PROXY: 'true' })).toThrow();
      expect(() => parseEnv({ ...validRawEnv, TRUST_PROXY: '-1' })).toThrow();
    });

    it('resolves req.ip from X-Forwarded-For using the configured hop count (M-04)', async () => {
      const ipApp = createApp((a) => {
        a.get('/__test/ip', (req, res) => {
          res.json({ ip: req.ip });
        });
      });
      // One trusted hop: the right-most X-Forwarded-For entry is the client, while
      // left-most entries (client-controlled) are ignored.
      const res = await request(ipApp)
        .get('/__test/ip')
        .set('X-Forwarded-For', '6.6.6.6, 203.0.113.7');
      expect(env.TRUST_PROXY).toBe(1);
      expect(res.body.ip).toBe('203.0.113.7');
    });
  });

  describe('1b. Standalone env precedence (A-26)', () => {
    it('lets real process values win over test defaults in standalone mode', () => {
      const raw = resolveRawEnv({
        MENTORA_STANDALONE: 'true',
        GEMINI_FAST_MODEL: 'configured-fast',
        GEMINI_REASONING_MODEL: 'configured-reasoning',
        GEMINI_API_KEY: 'real-key',
      });
      expect(raw.GEMINI_FAST_MODEL).toBe('configured-fast');
      expect(raw.GEMINI_REASONING_MODEL).toBe('configured-reasoning');
      expect(raw.GEMINI_API_KEY).toBe('real-key');
      // Gaps are still filled by defaults.
      expect(raw.JWT_SECRET).toBeDefined();
      expect(() => parseEnv(raw)).not.toThrow();
    });

    it('ignores empty process values in standalone mode so defaults still fill them', () => {
      const raw = resolveRawEnv({ MENTORA_STANDALONE: 'true', GEMINI_API_KEY: '' });
      expect(raw.GEMINI_API_KEY).toBe('test-gemini-api-key');
    });

    it('keeps test defaults authoritative in test mode', () => {
      const raw = resolveRawEnv({ NODE_ENV: 'test', GEMINI_FAST_MODEL: 'from-shell' });
      expect(raw.GEMINI_FAST_MODEL).toBe('gemini-3.5-flash-lite');
    });

    it('passes process.env through untouched outside test/standalone', () => {
      const input = { NODE_ENV: 'production', FOO: 'bar' };
      expect(resolveRawEnv(input)).toBe(input);
    });
  });

  describe('2. Health Endpoint & Security Headers (GET /api/v1/health)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const mockDbReadyState = (state: number) =>
      vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(state as never);

    it('returns 503 with db=false when the database is disconnected (A-29)', async () => {
      mockDbReadyState(0);
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: 'Database unavailable',
          details: { status: 'degraded', db: false, uptime: expect.any(Number) },
        },
      });
    });

    it('returns 200 OK with success envelope, status ok, and positive uptime', async () => {
      mockDbReadyState(1);
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', env.CLIENT_ORIGIN);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          status: 'ok',
          db: true,
          uptime: expect.any(Number),
        },
      });
      expect(res.body.data.uptime).toBeGreaterThanOrEqual(0);

      // Verify CORS headers for env.CLIENT_ORIGIN
      expect(res.headers['access-control-allow-origin']).toBe(env.CLIENT_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');

      // Verify Helmet security headers
      expect(res.headers['x-dns-prefetch-control']).toBe('off');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('3. Validation Middleware (400 VALIDATION_ERROR)', () => {
    const TestBodySchema = z.object({
      topic: z.string().trim().min(3, 'Topic must be at least 3 characters'),
      targetScore: z.number().int().min(1).max(10),
    });

    const createValidationApp = () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.post(
        '/test/validation',
        validateRequest({ body: TestBodySchema }),
        (req: Request, res: Response) => {
          res.status(200).json({ success: true, data: req.body });
        }
      );
      testApp.use(errorMiddleware);
      return testApp;
    };

    it('returns 400 VALIDATION_ERROR with issue details on invalid payload', async () => {
      const testApp = createValidationApp();
      const res = await request(testApp)
        .post('/test/validation')
        .send({ topic: 'ab', targetScore: 15 });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid request payload',
          details: {
            issues: expect.any(Array),
          },
        },
      });
      expect(res.body.error.details.issues.length).toBeGreaterThanOrEqual(1);
    });

    it('passes sanitized and parsed data to route handler on valid payload', async () => {
      const testApp = createValidationApp();
      const res = await request(testApp)
        .post('/test/validation')
        .send({ topic: '  Operating Systems  ', targetScore: 8 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          topic: 'Operating Systems',
          targetScore: 8,
        },
      });
    });
  });

  describe('4. Operational AppError & 404 Route Handling', () => {
    const createErrorApp = () => {
      const testApp = express();
      testApp.use(express.json());

      testApp.get(
        '/test/quota-error',
        asyncHandler(async () => {
          throw new AppError(
            429,
            ErrorCode.DAILY_QUOTA_EXCEEDED,
            'Daily tutor quota reached (50/day)',
            { resetAt: '2026-10-27T00:00:00.000Z' }
          );
        })
      );

      testApp.use(notFoundMiddleware);
      testApp.use(errorMiddleware);
      return testApp;
    };

    it('returns HTTP 429 with exact error envelope and details when AppError is thrown', async () => {
      const testApp = createErrorApp();
      const res = await request(testApp).get('/test/quota-error');

      expect(res.status).toBe(429);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.DAILY_QUOTA_EXCEEDED,
          message: 'Daily tutor quota reached (50/day)',
          details: {
            resetAt: '2026-10-27T00:00:00.000Z',
          },
        },
      });
    });

    it('returns HTTP 404 with RESOURCE_NOT_FOUND on unknown routes', async () => {
      const res = await request(app).get('/api/v1/nonexistent-endpoint');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.RESOURCE_NOT_FOUND,
          message: 'Cannot GET /api/v1/nonexistent-endpoint',
        },
      });
    });
  });

  describe('4b. Malformed/oversized JSON body (L-05)', () => {
    it('returns 400 VALIDATION_ERROR for a malformed JSON body instead of a raw 500', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{bad');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Malformed JSON payload',
        },
      });
    });

    it('returns 413 for a JSON body over the 100kb limit', async () => {
      const oversized = JSON.stringify({ email: 'a@b.com', password: 'x'.repeat(200_000) });
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send(oversized);

      expect(res.status).toBe(413);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Request payload is too large',
        },
      });
    });
  });

  describe('5. Unhandled 500 Error Redaction', () => {
    const createCrashingApp = () => {
      const testApp = express();
      testApp.use(express.json());

      testApp.get(
        '/test/crash',
        asyncHandler(async () => {
          throw new Error('Sensitive DB connection string leaked: mongodb+srv://admin:supersecret@cluster');
        })
      );

      testApp.use(errorMiddleware);
      return testApp;
    };

    it('returns HTTP 500 with generic message and redacts internal error message and stack traces', async () => {
      const testApp = createCrashingApp();
      const res = await request(testApp).get('/test/crash');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: 'An unexpected internal server error occurred',
        },
      });
      // Verify sensitive details and stack traces are never leaked in response body
      expect(JSON.stringify(res.body)).not.toContain('Sensitive DB connection string leaked');
      expect(JSON.stringify(res.body)).not.toContain('supersecret');
      expect(res.body.error.details).toBeUndefined();
      expect(res.body.stack).toBeUndefined();
    });
  });

  describe('6. Errors after headers are sent (T2.2)', () => {
    it('ends the response instead of writing a JSON envelope when headers were already sent', async () => {
      const testApp = express();
      testApp.get('/test/stream-crash', (_req: Request, res: Response, next) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.flushHeaders();
        res.write('event: start\ndata: {}\n\n');
        next(new Error('late failure'));
      });
      testApp.use(errorMiddleware);

      const res = await request(testApp).get('/test/stream-crash');
      expect(res.status).toBe(200);
      expect(res.text).toContain('event: start');
      expect(res.text).not.toContain('success');
    });

    it('never calls res.status() when headersSent is true', () => {
      const res = {
        headersSent: true,
        writableEnded: false,
        status: vi.fn(),
        json: vi.fn(),
        end: vi.fn(),
      } as unknown as Response;

      errorMiddleware(new Error('boom'), {} as Request, res, vi.fn());

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(res.end).toHaveBeenCalledTimes(1);
    });
  });
});
