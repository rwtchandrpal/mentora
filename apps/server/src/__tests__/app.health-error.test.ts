import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import { z } from 'zod';
import { ErrorCode } from '@mentora/shared';
import { env, parseEnv } from '../config/env.js';
import { app } from '../app.js';
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
  });

  describe('2. Health Endpoint & Security Headers (GET /api/v1/health)', () => {
    it('returns 200 OK with success envelope, status ok, and positive uptime', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', env.CLIENT_ORIGIN);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          status: 'ok',
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
});
