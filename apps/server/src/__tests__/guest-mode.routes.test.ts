import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  LearningMode,
  GUEST_DAILY_AI_QUOTA_LIMIT,
  ErrorCode,
} from '@mentora/shared';
import { app } from '../app.js';
import { User } from '../models/User.model.js';
import { TopicSession } from '../models/TopicSession.model.js';
import { clearGuestQuotaStore } from '../middlewares/quota.middleware.js';

describe('Guest Mode Backend Integration Tests', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    await User.syncIndexes();
    await TopicSession.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await TopicSession.deleteMany({});
    await User.deleteMany({});
    clearGuestQuotaStore();
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

      // Verify MongoDB document
      const doc = await TopicSession.findById(res.body.data.id);
      expect(doc).not.toBeNull();
      expect(doc?.isGuest).toBe(true);
      expect(doc?.userId).toBeNull();
      expect(doc?.expiresAt).toBeInstanceOf(Date);
      expect(doc!.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('retrieves an existing guest session without authentication headers', async () => {
      const createRes = await request(app)
        .post('/api/v1/sessions')
        .send({
          topicQuery: 'Graph Theory',
          initialMode: LearningMode.INTERACT,
          autoInitialize: false,
        });

      const sessionId = createRes.body.data.id;

      const fetchRes = await request(app).get(`/api/v1/sessions/${sessionId}`);
      expect(fetchRes.status).toBe(200);
      expect(fetchRes.body.data.id).toBe(sessionId);
      expect(fetchRes.body.data.isGuest).toBe(true);
      expect(fetchRes.body.data.topicQuery).toBe('Graph Theory');
    });

    it('allows a guest to switch learning modes on their session', async () => {
      const createRes = await request(app)
        .post('/api/v1/sessions')
        .send({
          topicQuery: 'Cellular Respiration',
          initialMode: LearningMode.EXPLAIN,
          autoInitialize: false,
        });

      const sessionId = createRes.body.data.id;

      const switchRes = await request(app)
        .patch(`/api/v1/sessions/${sessionId}/mode`)
        .send({ mode: LearningMode.PRACTICE });

      expect(switchRes.status).toBe(200);
      expect(switchRes.body.data.lastActiveMode).toBe(LearningMode.PRACTICE);
    });

    it('allows a guest to delete their session', async () => {
      const createRes = await request(app)
        .post('/api/v1/sessions')
        .send({
          topicQuery: 'Calculus Limits',
          initialMode: LearningMode.EXPLAIN,
          autoInitialize: false,
        });

      const sessionId = createRes.body.data.id;

      const deleteRes = await request(app).delete(`/api/v1/sessions/${sessionId}`);
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
  });

  describe('3. Guest Quota Rate Limiting', () => {
    it('enforces GUEST_DAILY_AI_QUOTA_LIMIT and blocks with 429 when quota is exceeded', async () => {
      // Simulate exhausting guest quota
      for (let i = 0; i < GUEST_DAILY_AI_QUOTA_LIMIT; i++) {
        const res = await request(app)
          .post('/api/v1/sessions')
          .set('X-Forwarded-For', '203.0.113.195')
          .send({
            topicQuery: `Guest Topic ${i}`,
            initialMode: LearningMode.EXPLAIN,
            autoInitialize: false,
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
  });
});
