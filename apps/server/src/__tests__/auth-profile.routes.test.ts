import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
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

describe('IMP-006: Auth & Profile Routes Integration Tests', () => {
  let mongoServer: MongoMemoryServer;

  // Test app with an attached protected test route to verify requireCompletedProfile (BR-01)
  const app = createApp((testApp) => {
    testApp.get(
      '/api/v1/test-guarded',
      requireAuth,
      requireCompletedProfile,
      (_req, res) => {
        res.status(200).json({ success: true, message: 'Access granted to workspace' });
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

  describe('1. POST /api/v1/auth/register', () => {
    const validRegisterPayload = {
      name: 'Marie Curie',
      email: 'marie.curie@example.com',
      password: 'password1234',
    };

    it('registers a new user, returns JWT and UserDTO with incomplete profile, and excludes passwordHash', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(validRegisterPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();

      const userDto = res.body.data.user;
      expect(userDto.name).toBe('Marie Curie');
      expect(userDto.email).toBe('marie.curie@example.com');
      expect(userDto.profile.isCompleted).toBe(false);
      expect(userDto.profile.educationLevel).toBeNull();
      expect(userDto.profile.preferredStyle).toBeNull();
      expect(userDto.usageQuota.dailyCount).toBe(0);
      expect(userDto.usageQuota.dailyLimit).toBe(env.DAILY_AI_QUOTA_LIMIT);
      expect(userDto.passwordHash).toBeUndefined();

      // Verify stored password in MongoDB is hashed with bcrypt cost factor 12
      const storedUser = await User.findOne({ email: 'marie.curie@example.com' }).select('+passwordHash');
      expect(storedUser).not.toBeNull();
      expect(storedUser?.passwordHash).toMatch(/^\$2[ab]\$12\$/);
    });

    it('rejects duplicate email registration with 400 VALIDATION_ERROR', async () => {
      await request(app).post('/api/v1/auth/register').send(validRegisterPayload);

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Another Name',
          email: 'MARIE.CURIE@example.com',
          password: 'anotherpassword',
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'An account with this email already exists',
        },
      });
    });

    it('rejects invalid email with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Invalid Email User',
          email: 'not-a-valid-email',
          password: 'password1234',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('rejects short password with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Short Pass User',
          email: 'shortpass@example.com',
          password: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe('2. POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send({
        name: 'Rosalind Franklin',
        email: 'rosalind@example.com',
        password: 'correctpassword123',
      });
    });

    it('authenticates valid credentials and returns JWT + UserDTO', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'ROSALIND@example.com',
          password: 'correctpassword123',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('rosalind@example.com');
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('rejects wrong password with 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'rosalind@example.com',
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Invalid email or password',
        },
      });
    });

    it('rejects nonexistent email with 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nobody@example.com',
          password: 'somepassword123',
        });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Invalid email or password',
        },
      });
    });
  });

  describe('3. GET /api/v1/auth/me & requireAuth Middleware', () => {
    let token: string;

    beforeEach(async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'Chien-Shiung Wu',
        email: 'wu@example.com',
        password: 'password1234',
      });
      token = res.body.data.token;
    });

    it('returns current authenticated UserDTO with valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Chien-Shiung Wu');
      expect(res.body.data.email).toBe('wu@example.com');
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('rejects request with missing Authorization header', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('rejects request with malformed Authorization header', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Basic somecredentials');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('rejects token signed with wrong secret', async () => {
      const badToken = jwt.sign(
        { sub: 'someid', email: 'fake@example.com' },
        'this-is-a-completely-different-wrong-secret-key-32',
        { algorithm: 'HS256' }
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${badToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('rejects expired token', async () => {
      const expiredToken = jwt.sign(
        { sub: 'someid', email: 'expired@example.com' },
        env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '-1s' }
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    });
  });

  describe('4. PUT /api/v1/profile & requireCompletedProfile Middleware (BR-01)', () => {
    let token: string;

    beforeEach(async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'Barbara McClintock',
        email: 'barbara@example.com',
        password: 'password1234',
      });
      token = res.body.data.token;
    });

    it('enforces BR-01: blocks access with 403 PROFILE_INCOMPLETE until profile onboarding is saved', async () => {
      // 1. Newly registered user has incomplete profile -> guarded route returns 403
      const blockedRes = await request(app)
        .get('/api/v1/test-guarded')
        .set('Authorization', `Bearer ${token}`);

      expect(blockedRes.status).toBe(403);
      expect(blockedRes.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.PROFILE_INCOMPLETE,
          message: 'Please complete your learner profile onboarding before accessing study sessions',
        },
      });

      // 2. Complete onboarding via PUT /api/v1/profile
      const updateRes = await request(app)
        .put('/api/v1/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          educationLevel: EducationLevel.UNDERGRADUATE,
          preferredStyle: ExplanationStyle.CONCISE_TECHNICAL,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.data.profile.isCompleted).toBe(true);
      expect(updateRes.body.data.profile.educationLevel).toBe(EducationLevel.UNDERGRADUATE);
      expect(updateRes.body.data.profile.preferredStyle).toBe(ExplanationStyle.CONCISE_TECHNICAL);

      // 3. Guarded route now succeeds with 200 OK
      const allowedRes = await request(app)
        .get('/api/v1/test-guarded')
        .set('Authorization', `Bearer ${token}`);

      expect(allowedRes.status).toBe(200);
      expect(allowedRes.body).toEqual({
        success: true,
        message: 'Access granted to workspace',
      });

      // 4. Update profile again with new preferences (FR-003)
      const reUpdateRes = await request(app)
        .put('/api/v1/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          educationLevel: EducationLevel.PROFESSIONAL,
          preferredStyle: ExplanationStyle.VISUAL,
        });

      expect(reUpdateRes.status).toBe(200);
      expect(reUpdateRes.body.data.profile.educationLevel).toBe(EducationLevel.PROFESSIONAL);
      expect(reUpdateRes.body.data.profile.preferredStyle).toBe(ExplanationStyle.VISUAL);
    });

    it('rejects invalid enum values with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .put('/api/v1/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          educationLevel: 'kindergarten',
          preferredStyle: 'interpretive_dance',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });
});
