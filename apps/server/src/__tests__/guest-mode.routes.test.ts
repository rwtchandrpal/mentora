import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { GoogleGenAI } from '@google/genai';
import {
  ExplainStepType,
  LearningMode,
  GUEST_DAILY_AI_QUOTA_LIMIT,
  GUEST_TOKEN_HEADER,
  ErrorCode,
} from '@mentora/shared';
import { app } from '../app.js';
import { User } from '../models/User.model.js';
import { TopicSession } from '../models/TopicSession.model.js';
import { GuestQuota } from '../models/GuestQuota.model.js';
import {
  clearGuestQuotaStore,
  incrementGuestQuota,
  syncGuestQuotaWindow,
} from '../middlewares/quota.middleware.js';
import { signAccessToken, signGuestToken } from '../services/auth.service.js';
import { setGeminiClient, resetGeminiClient } from '../ai/gemini.client.js';

const explainInitPayload = {
  isEducationalValid: true,
  normalizedTitle: 'Guest Topic',
  cards: [
    ExplainStepType.INTUITION,
    ExplainStepType.CORE_MECHANISM,
    ExplainStepType.EXAMPLE,
    ExplainStepType.CHECK_FOR_UNDERSTANDING,
  ].map((stepType, idx) => ({
    stepNumber: idx + 1,
    stepType,
    title: `Card ${idx + 1}`,
    contentMarkdown: `Content for card ${idx + 1}.`,
    checkQuestion: idx === 3 ? 'Why?' : null,
    checkAnswer: idx === 3 ? 'Because.' : null,
  })),
};

const mockExplainGemini = () => {
  const generateContent = vi.fn().mockImplementation(async () => ({
    text: JSON.stringify(explainInitPayload),
  }));
  setGeminiClient({ models: { generateContent } } as unknown as GoogleGenAI);
  return generateContent;
};

const createGuestSession = async (
  topicQuery: string,
  initialMode: LearningMode = LearningMode.EXPLAIN
): Promise<{ sessionId: string; guestToken: string }> => {
  const res = await request(app)
    .post('/api/v1/sessions')
    .send({ topicQuery, initialMode, autoInitialize: false });
  expect(res.status).toBe(201);
  return { sessionId: res.body.data.id, guestToken: res.body.meta.guestToken };
};

describe('Guest Mode Backend Integration Tests', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    await User.syncIndexes();
    await TopicSession.syncIndexes();
    await GuestQuota.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    resetGeminiClient();
    await TopicSession.deleteMany({});
    await User.deleteMany({});
    await clearGuestQuotaStore();
  });

  describe('1. Ephemeral Guest Session Lifecycle', () => {
    it('creates an ephemeral guest session without authentication headers', async () => {
      const res = await request(app)
        .post('/api/v1/sessions')
        .send({
          topicQuery: 'Quantum Entanglement',
          initialMode: LearningMode.EXPLAIN,
          autoInitialize: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.topicQuery).toBe('Quantum Entanglement');
      expect(res.body.data.isGuest).toBe(true);
      expect(res.body.data.userId).toBeNull();
      expect(res.body.meta?.quota).toBeDefined();
      expect(res.body.meta?.quota.limit).toBe(GUEST_DAILY_AI_QUOTA_LIMIT);
      expect(typeof res.body.meta?.guestToken).toBe('string');

      // Verify MongoDB document
      const doc = await TopicSession.findById(res.body.data.id);
      expect(doc).not.toBeNull();
      expect(doc?.isGuest).toBe(true);
      expect(doc?.userId).toBeNull();
      expect(doc?.expiresAt).toBeInstanceOf(Date);
      expect(doc!.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('retrieves an existing guest session with its guest token', async () => {
      const { sessionId, guestToken } = await createGuestSession(
        'Graph Theory',
        LearningMode.INTERACT
      );

      const fetchRes = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set(GUEST_TOKEN_HEADER, guestToken);
      expect(fetchRes.status).toBe(200);
      expect(fetchRes.body.data.id).toBe(sessionId);
      expect(fetchRes.body.data.isGuest).toBe(true);
      expect(fetchRes.body.data.topicQuery).toBe('Graph Theory');
    });

    it('allows a guest to switch learning modes on their session', async () => {
      const { sessionId, guestToken } = await createGuestSession('Cellular Respiration');

      const switchRes = await request(app)
        .patch(`/api/v1/sessions/${sessionId}/mode`)
        .set(GUEST_TOKEN_HEADER, guestToken)
        .send({ mode: LearningMode.PRACTICE });

      expect(switchRes.status).toBe(200);
      expect(switchRes.body.data.lastActiveMode).toBe(LearningMode.PRACTICE);
    });

    it('allows a guest to delete their session', async () => {
      const { sessionId, guestToken } = await createGuestSession('Calculus Limits');

      const deleteRes = await request(app)
        .delete(`/api/v1/sessions/${sessionId}`)
        .set(GUEST_TOKEN_HEADER, guestToken);
      expect(deleteRes.status).toBe(200);

      const checkDoc = await TopicSession.findById(sessionId);
      expect(checkDoc).toBeNull();
    });
  });

  describe('2. Multi-Tenant Security & Isolation', () => {
    it('rejects unauthenticated requests trying to access an authenticated user session with 401 UNAUTHORIZED', async () => {
      // Create an authenticated session in DB
      const userDoc = await User.create({
        name: 'Registered User',
        email: 'reg@example.com',
        passwordHash: 'hashedpassword',
        profile: {
          isCompleted: true,
          educationLevel: 'undergraduate',
          preferredStyle: 'visual',
        },
      });

      const authSession = await TopicSession.create({
        userId: userDoc._id,
        isGuest: false,
        topicQuery: 'Private Research',
        normalizedTitle: 'Private Research',
        lastActiveMode: LearningMode.EXPLAIN,
      });

      // An unauthenticated guest attempts to fetch the registered user's session
      const res = await request(app).get(`/api/v1/sessions/${authSession._id.toString()}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('rejects unauthenticated requests to list user sessions with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/v1/sessions');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('rejects every per-session route without a guest token with 401 (A-01)', async () => {
      const { sessionId } = await createGuestSession('Thermodynamics');

      const calls = [
        request(app).get(`/api/v1/sessions/${sessionId}`),
        request(app)
          .patch(`/api/v1/sessions/${sessionId}/mode`)
          .send({ mode: LearningMode.PRACTICE }),
        request(app).delete(`/api/v1/sessions/${sessionId}`),
        request(app).post(`/api/v1/sessions/${sessionId}/explain/init`),
        request(app)
          .patch(`/api/v1/sessions/${sessionId}/explain/step`)
          .send({ stepIndex: 1 }),
        request(app).post(`/api/v1/sessions/${sessionId}/interact/init`),
        request(app)
          .post(`/api/v1/sessions/${sessionId}/interact/stream`)
          .send({ message: 'hello' }),
        request(app)
          .post(`/api/v1/sessions/${sessionId}/practice/generate`)
          .send({ tier: 'easy' }),
        request(app)
          .post(`/api/v1/sessions/${sessionId}/practice/submit`)
          .send({ tier: 'easy', answers: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }),
      ];

      for (const call of calls) {
        const res = await call;
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
      }

      expect(await TopicSession.findById(sessionId)).not.toBeNull();
    });

    it("rejects one guest's token on another guest's session with 404 and leaves it untouched (A-01)", async () => {
      const guestA = await createGuestSession('Session Owned By A');
      const guestB = await createGuestSession('Session Owned By B');

      const readRes = await request(app)
        .get(`/api/v1/sessions/${guestB.sessionId}`)
        .set(GUEST_TOKEN_HEADER, guestA.guestToken);
      expect(readRes.status).toBe(404);
      expect(readRes.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);

      const switchRes = await request(app)
        .patch(`/api/v1/sessions/${guestB.sessionId}/mode`)
        .set(GUEST_TOKEN_HEADER, guestA.guestToken)
        .send({ mode: LearningMode.PRACTICE });
      expect(switchRes.status).toBe(404);

      const aiRes = await request(app)
        .post(`/api/v1/sessions/${guestB.sessionId}/explain/init`)
        .set(GUEST_TOKEN_HEADER, guestA.guestToken);
      expect(aiRes.status).toBe(404);

      const deleteRes = await request(app)
        .delete(`/api/v1/sessions/${guestB.sessionId}`)
        .set(GUEST_TOKEN_HEADER, guestA.guestToken);
      expect(deleteRes.status).toBe(404);

      const docB = await TopicSession.findById(guestB.sessionId);
      expect(docB).not.toBeNull();
      expect(docB?.lastActiveMode).toBe(LearningMode.EXPLAIN);
    });

    it('rejects malformed, tampered and user-type tokens in the guest header', async () => {
      const { sessionId, guestToken } = await createGuestSession('Token Integrity');

      const tampered = `${guestToken.slice(0, -4)}AAAA`;
      const userToken = signAccessToken({
        sub: new mongoose.Types.ObjectId().toString(),
        email: 'someone@example.com',
      });

      for (const badToken of ['not-a-jwt', tampered, userToken]) {
        const res = await request(app)
          .get(`/api/v1/sessions/${sessionId}`)
          .set(GUEST_TOKEN_HEADER, badToken);
        expect(res.status).toBe(401);
      }
    });

    it('does not accept a guest token as a user bearer token', async () => {
      const { sessionId } = await createGuestSession('Bearer Confusion');
      const res = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${signGuestToken(sessionId)}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    });
  });

  describe('3. Guest Quota Rate Limiting', () => {
    it('enforces GUEST_DAILY_AI_QUOTA_LIMIT and blocks with 429 when quota is exceeded', async () => {
      mockExplainGemini();
      // Simulate exhausting guest quota with charged (auto-initialized) creates
      for (let i = 0; i < GUEST_DAILY_AI_QUOTA_LIMIT; i++) {
        const res = await request(app)
          .post('/api/v1/sessions')
          .set('X-Forwarded-For', '203.0.113.195')
          .send({
            topicQuery: `Guest Topic ${i}`,
            initialMode: LearningMode.EXPLAIN,
          });
        expect(res.status).toBe(201);
      }

      // Next guest AI action exceeds limit
      const blockedRes = await request(app)
        .post('/api/v1/sessions')
        .set('X-Forwarded-For', '203.0.113.195')
        .send({
          topicQuery: 'One Too Many Topics',
          initialMode: LearningMode.EXPLAIN,
          autoInitialize: false,
        });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error.code).toBe(ErrorCode.DAILY_QUOTA_EXCEEDED);
      expect(blockedRes.body.error.message).toContain('daily guest limit');
    });

    it('ignores spoofed left-most X-Forwarded-For entries when identifying guests (A-02)', async () => {
      // The proxy appends the real client IP as the right-most entry; everything to its
      // left is client-controlled and must not create a fresh quota bucket.
      const realClientIp = '198.51.100.7';
      mockExplainGemini();
      for (let i = 0; i < GUEST_DAILY_AI_QUOTA_LIMIT; i++) {
        const res = await request(app)
          .post('/api/v1/sessions')
          .set('X-Forwarded-For', `10.0.${i}.1, ${realClientIp}`)
          .send({
            topicQuery: `Spoof Attempt ${i}`,
            initialMode: LearningMode.EXPLAIN,
          });
        expect(res.status).toBe(201);
      }

      const blockedRes = await request(app)
        .post('/api/v1/sessions')
        .set('X-Forwarded-For', `10.0.99.1, ${realClientIp}`)
        .send({
          topicQuery: 'Spoof Attempt Blocked',
          initialMode: LearningMode.EXPLAIN,
          autoInitialize: false,
        });
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error.code).toBe(ErrorCode.DAILY_QUOTA_EXCEEDED);
    });
  });

  describe('4. Persistent Guest Quota Store (A-08)', () => {
    it('persists guest usage in MongoDB with a TTL-expiring window', async () => {
      const meta = await incrementGuestQuota('203.0.113.10');
      expect(meta.used).toBe(1);
      expect(meta.limit).toBe(GUEST_DAILY_AI_QUOTA_LIMIT);

      const doc = await GuestQuota.findById('203.0.113.10').lean();
      expect(doc?.count).toBe(1);
      expect(doc!.windowResetAt.getTime()).toBeGreaterThan(Date.now());

      const indexes = await GuestQuota.collection.indexes();
      const ttlIndex = indexes.find((idx) => idx.key.windowResetAt === 1);
      expect(ttlIndex?.expireAfterSeconds).toBe(0);
    });

    it('starts a fresh window once the previous one has ended', async () => {
      const start = new Date('2026-01-01T00:00:00.000Z');
      await incrementGuestQuota('203.0.113.11', start);
      await incrementGuestQuota('203.0.113.11', start);

      const afterWindow = new Date(start.getTime() + 25 * 60 * 60 * 1000);
      const record = await syncGuestQuotaWindow('203.0.113.11', afterWindow);
      expect(record.count).toBe(0);
      expect(record.windowResetAt.getTime()).toBeGreaterThan(afterWindow.getTime());
    });

    it('creates a single record when the first requests for a guest arrive concurrently', async () => {
      await Promise.all(
        Array.from({ length: 5 }, () => syncGuestQuotaWindow('203.0.113.12'))
      );
      expect(await GuestQuota.countDocuments({ _id: '203.0.113.12' })).toBe(1);
    });
  });

  describe('5. Guest Charging Matches User Charging (A-06)', () => {
    const guestIp = '192.0.2.50';

    it('does not charge for a session created with autoInitialize:false', async () => {
      const res = await request(app)
        .post('/api/v1/sessions')
        .set('X-Forwarded-For', guestIp)
        .send({ topicQuery: 'No Charge', initialMode: LearningMode.EXPLAIN, autoInitialize: false });

      expect(res.status).toBe(201);
      expect(res.body.meta.quota.used).toBe(0);
      const record = await GuestQuota.findById(guestIp).lean();
      expect(record?.count ?? 0).toBe(0);
    });

    it('charges explain/init once and the idempotent repeat call not at all', async () => {
      const generateContent = mockExplainGemini();
      const createRes = await request(app)
        .post('/api/v1/sessions')
        .set('X-Forwarded-For', guestIp)
        .send({ topicQuery: 'Charge Once', initialMode: LearningMode.EXPLAIN, autoInitialize: false });
      const { id: sessionId } = createRes.body.data;
      const { guestToken } = createRes.body.meta;

      const first = await request(app)
        .post(`/api/v1/sessions/${sessionId}/explain/init`)
        .set('X-Forwarded-For', guestIp)
        .set(GUEST_TOKEN_HEADER, guestToken);
      expect(first.status).toBe(200);
      expect(first.body.meta.quota.used).toBe(1);

      const second = await request(app)
        .post(`/api/v1/sessions/${sessionId}/explain/init`)
        .set('X-Forwarded-For', guestIp)
        .set(GUEST_TOKEN_HEADER, guestToken);
      expect(second.status).toBe(200);
      expect(second.body.meta.quota.used).toBe(1);

      expect(generateContent).toHaveBeenCalledTimes(1);
      const record = await GuestQuota.findById(guestIp).lean();
      expect(record?.count).toBe(1);
    });

    it('does not charge a guest when AI generation fails', async () => {
      const generateContent = vi.fn().mockRejectedValue(new Error('upstream down'));
      setGeminiClient({ models: { generateContent } } as unknown as GoogleGenAI);

      const res = await request(app)
        .post('/api/v1/sessions')
        .set('X-Forwarded-For', guestIp)
        .send({ topicQuery: 'Failing Topic', initialMode: LearningMode.EXPLAIN });

      expect(res.status).toBeGreaterThanOrEqual(500);
      const record = await GuestQuota.findById(guestIp).lean();
      expect(record?.count ?? 0).toBe(0);
    });
  });
});
