import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  EducationLevel,
  ExplanationStyle,
  ErrorCode,
} from '@mentora/shared';
import { env } from '../config/env.js';
import { createApp } from '../app.js';
import { User } from '../models/User.model.js';
import { requireAuth, requireCompletedProfile } from '../middlewares/auth.middleware.js';
import {
  quotaMiddleware,
  incrementUserQuota,
  toQuotaMetaDTO,
} from '../middlewares/quota.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authService } from '../services/auth.service.js';

describe('IMP-007: Rolling 24-Hour AI Usage Quota Middleware (BR-04)', () => {
  let mongoServer: MongoMemoryServer;

  const app = createApp((testApp) => {
    testApp.post(
      '/api/v1/test-ai-action',
      requireAuth,
      requireCompletedProfile,
      quotaMiddleware,
      asyncHandler(async (req, res) => {
        const quota = await incrementUserQuota(req.user!.id);
        res.status(200).json({
          success: true,
          data: { ok: true },
          meta: { quota },
        });
      })
    );

    testApp.get(
      '/api/v1/test-readonly',
      requireAuth,
      requireCompletedProfile,
      (_req, res) => {
        res.status(200).json({
          success: true,
          data: { message: 'Read-only resource' },
        });
      }
    );
  });

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    await User.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('toQuotaMetaDTO helper', () => {
    it('correctly maps dailyCount and windowResetAt to a valid QuotaMetaDTO', () => {
      const resetAtDate = new Date('2026-10-28T12:00:00.000Z');
      const dto = toQuotaMetaDTO({
        dailyCount: 15,
        windowResetAt: resetAtDate,
      });

      expect(dto).toEqual({
        used: 15,
        limit: env.DAILY_AI_QUOTA_LIMIT,
        resetAt: '2026-10-28T12:00:00.000Z',
      });
    });
  });

  describe('Quota Enforcement Lifecycle (BR-04)', () => {
    let token: string;
    let userId: string;

    beforeEach(async () => {
      const authData = await authService.register({
        name: 'Hypatia of Alexandria',
        email: 'hypatia@example.com',
        password: 'password1234',
      });
      token = authData.token;
      userId = authData.user.id;

      // Complete profile onboarding so requireCompletedProfile passes
      await authService.updateProfile(userId, {
        educationLevel: EducationLevel.UNDERGRADUATE,
        preferredStyle: ExplanationStyle.CONCISE_TECHNICAL,
      });
    });

    it('Request 1 passes: increments quota from 0 to 1 and attaches meta.quota', async () => {
      const res = await request(app)
        .post('/api/v1/test-ai-action')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.meta.quota).toEqual({
        used: 1,
        limit: env.DAILY_AI_QUOTA_LIMIT,
        resetAt: expect.any(String),
      });

      // Verify DB persistence
      const user = await User.findById(userId);
      expect(user?.usageQuota.dailyCount).toBe(1);
    });

    it('Request 50 (Boundary #50) passes: when dailyCount is 49, request 50 succeeds and returns used = 50', async () => {
      // Set quota to 49
      await User.findByIdAndUpdate(userId, {
        $set: {
          'usageQuota.dailyCount': 49,
          'usageQuota.windowResetAt': new Date(Date.now() + 12 * 60 * 60 * 1000),
        },
      });

      const res = await request(app)
        .post('/api/v1/test-ai-action')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.meta.quota.used).toBe(50);
      expect(res.body.meta.quota.limit).toBe(50);

      const user = await User.findById(userId);
      expect(user?.usageQuota.dailyCount).toBe(50);
    });

    it('Request 51 is blocked with HTTP 429 DAILY_QUOTA_EXCEEDED and resetAt details', async () => {
      const resetTime = new Date(Date.now() + 10 * 60 * 60 * 1000);

      // Set user quota to limit (50)
      await User.findByIdAndUpdate(userId, {
        $set: {
          'usageQuota.dailyCount': 50,
          'usageQuota.windowResetAt': resetTime,
        },
      });

      const res = await request(app)
        .post('/api/v1/test-ai-action')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(429);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.DAILY_QUOTA_EXCEEDED,
          message: `You have reached your daily limit of ${env.DAILY_AI_QUOTA_LIMIT} tutor actions. You can still review all saved sessions.`,
          details: {
            resetAt: resetTime.toISOString(),
            used: 50,
            limit: 50,
          },
        },
      });

      // Confirm dailyCount was NOT incremented past 50
      const user = await User.findById(userId);
      expect(user?.usageQuota.dailyCount).toBe(50);
    });

    it('Read-only routes remain accessible when user is at 50/50 quota limit (BR-04)', async () => {
      // Set user quota to limit (50)
      await User.findByIdAndUpdate(userId, {
        $set: {
          'usageQuota.dailyCount': 50,
          'usageQuota.windowResetAt': new Date(Date.now() + 8 * 60 * 60 * 1000),
        },
      });

      // Verify AI route is blocked
      const aiRes = await request(app)
        .post('/api/v1/test-ai-action')
        .set('Authorization', `Bearer ${token}`);
      expect(aiRes.status).toBe(429);

      // Read-only test route remains 200 OK
      const readonlyRes = await request(app)
        .get('/api/v1/test-readonly')
        .set('Authorization', `Bearer ${token}`);
      expect(readonlyRes.status).toBe(200);
      expect(readonlyRes.body.data.message).toBe('Read-only resource');

      // GET /api/v1/auth/me remains 200 OK
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(meRes.status).toBe(200);
      expect(meRes.body.data.usageQuota.dailyCount).toBe(50);
    });

    it('Automatic 24-hour rollover: expired window automatically resets to 0 and action increments to 1', async () => {
      const expiredWindow = new Date(Date.now() - 5000); // 5 seconds in the past

      // Set user quota to 50 with an expired window
      await User.findByIdAndUpdate(userId, {
        $set: {
          'usageQuota.dailyCount': 50,
          'usageQuota.windowResetAt': expiredWindow,
        },
      });

      const res = await request(app)
        .post('/api/v1/test-ai-action')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.meta.quota.used).toBe(1);
      expect(res.body.meta.quota.limit).toBe(50);

      // New windowResetAt should be ~24 hours in the future
      const newResetAt = new Date(res.body.meta.quota.resetAt);
      expect(newResetAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);

      const user = await User.findById(userId);
      expect(user?.usageQuota.dailyCount).toBe(1);
    });
  });
});
