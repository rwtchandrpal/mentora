import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  EducationLevel,
  ExplanationStyle,
  LearningMode,
  BatchStatus,
  ErrorCode,
} from '@mentora/shared';
import { app } from '../app.js';
import { User } from '../models/User.model.js';
import { TopicSession } from '../models/TopicSession.model.js';
import { authService } from '../services/auth.service.js';

describe('IMP-008: TopicSession CRUD & Answer-Masking Mapper (BR-03, FR-004–FR-006, NFR-005)', () => {
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
  });

  const setupTestUser = async (name: string, email: string, completeProfile = true) => {
    const authData = await authService.register({
      name,
      email,
      password: 'password1234',
    });

    if (completeProfile) {
      await authService.updateProfile(authData.user.id, {
        educationLevel: EducationLevel.UNDERGRADUATE,
        preferredStyle: ExplanationStyle.CONCISE_TECHNICAL,
      });
    }

    return {
      userId: authData.user.id,
      token: authData.token,
    };
  };

  describe('1. Guard Enforcement (BR-01 & Auth)', () => {
    it('rejects unauthenticated requests to /api/v1/sessions with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/v1/sessions');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('blocks access with 403 PROFILE_INCOMPLETE if learner profile is not completed (BR-01)', async () => {
      const incompleteUser = await setupTestUser(
        'Incomplete User',
        'incomplete@example.com',
        false
      );

      const res = await request(app)
        .get('/api/v1/sessions')
        .set('Authorization', `Bearer ${incompleteUser.token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.PROFILE_INCOMPLETE);
    });
  });

  describe('2. Create & List Sessions (FR-004 & FR-006)', () => {
    it('creates a new TopicSession with valid initial state (BR-02)', async () => {
      const user = await setupTestUser('Ada Lovelace', 'ada@example.com');

      const res = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Deadlocks in Operating Systems',
          initialMode: LearningMode.EXPLAIN,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        topicQuery: 'Deadlocks in Operating Systems',
        normalizedTitle: 'Deadlocks in Operating Systems',
        lastActiveMode: LearningMode.EXPLAIN,
        userId: user.userId,
      });
      expect(res.body.data.id).toBeDefined();

      // BR-02 check: Easy is not_started, Medium and Hard are locked
      const { batches } = res.body.data.practiceState;
      expect(batches.easy.status).toBe(BatchStatus.NOT_STARTED);
      expect(batches.medium.status).toBe(BatchStatus.LOCKED);
      expect(batches.hard.status).toBe(BatchStatus.LOCKED);

      // Quota meta is present
      expect(res.body.meta?.quota).toBeDefined();
    });

    it('rejects invalid create requests with 400 VALIDATION_ERROR', async () => {
      const user = await setupTestUser('Ada Lovelace', 'ada@example.com');

      const res = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: '',
          initialMode: 'invalid_mode',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('lists user sessions sorted chronologically by updatedAt DESC', async () => {
      const user = await setupTestUser('Alan Turing', 'alan@example.com');

      // Create two sessions sequentially
      const s1 = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Turing Machines',
          initialMode: LearningMode.EXPLAIN,
        });

      // Small delay to ensure distinct updatedAt
      await new Promise((resolve) => setTimeout(resolve, 50));

      const s2 = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Halting Problem',
          initialMode: LearningMode.INTERACT,
        });

      const listRes = await request(app)
        .get('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data).toHaveLength(2);

      // S2 was created later -> appears first
      expect(listRes.body.data[0].id).toBe(s2.body.data.id);
      expect(listRes.body.data[0].topicQuery).toBe('Halting Problem');
      expect(listRes.body.data[1].id).toBe(s1.body.data.id);
      expect(listRes.body.data[1].topicQuery).toBe('Turing Machines');
    });
  });

  describe('3. Mode Switching (FR-005)', () => {
    it('updates lastActiveMode when switching learning tabs', async () => {
      const user = await setupTestUser('Grace Hopper', 'grace@example.com');

      const created = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Compilers and Linkers',
          initialMode: LearningMode.EXPLAIN,
        });

      const sessionId = created.body.data.id;

      const switchRes = await request(app)
        .patch(`/api/v1/sessions/${sessionId}/mode`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ mode: LearningMode.INTERACT });

      expect(switchRes.status).toBe(200);
      expect(switchRes.body.success).toBe(true);
      expect(switchRes.body.data.lastActiveMode).toBe(LearningMode.INTERACT);

      // Verify persistence
      const fetchRes = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(fetchRes.body.data.lastActiveMode).toBe(LearningMode.INTERACT);
    });

    it('rejects invalid mode update with 400 VALIDATION_ERROR', async () => {
      const user = await setupTestUser('Grace Hopper', 'grace@example.com');

      const created = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Compilers and Linkers',
          initialMode: LearningMode.EXPLAIN,
        });

      const sessionId = created.body.data.id;

      const switchRes = await request(app)
        .patch(`/api/v1/sessions/${sessionId}/mode`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ mode: 'fly_mode' });

      expect(switchRes.status).toBe(400);
      expect(switchRes.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe('4. Multi-Tenant Isolation (NFR-005)', () => {
    it('returns 404 RESOURCE_NOT_FOUND when accessing another user session', async () => {
      const userA = await setupTestUser('User A', 'user_a@example.com');
      const userB = await setupTestUser('User B', 'user_b@example.com');

      const createdA = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          topicQuery: 'Secret Research of User A',
          initialMode: LearningMode.EXPLAIN,
        });

      const userASessionId = createdA.body.data.id;

      // User B tries to read User A's session
      const getRes = await request(app)
        .get(`/api/v1/sessions/${userASessionId}`)
        .set('Authorization', `Bearer ${userB.token}`);
      expect(getRes.status).toBe(404);
      expect(getRes.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);

      // User B tries to update User A's session mode
      const patchRes = await request(app)
        .patch(`/api/v1/sessions/${userASessionId}/mode`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ mode: LearningMode.PRACTICE });
      expect(patchRes.status).toBe(404);
      expect(patchRes.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);

      // User B tries to delete User A's session
      const deleteRes = await request(app)
        .delete(`/api/v1/sessions/${userASessionId}`)
        .set('Authorization', `Bearer ${userB.token}`);
      expect(deleteRes.status).toBe(404);
      expect(deleteRes.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);

      // Confirm User A's session is still intact
      const confirmRes = await request(app)
        .get(`/api/v1/sessions/${userASessionId}`)
        .set('Authorization', `Bearer ${userA.token}`);
      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.data.lastActiveMode).toBe(LearningMode.EXPLAIN);
    });
  });

  describe('5. Practice Batch Answer-Key Masking (BR-03)', () => {
    it('masks correctOptionIndex and solutionExplanation when batch is in_progress, and reveals them when completed', async () => {
      const user = await setupTestUser('Marie Curie', 'marie@example.com');

      const created = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Radioactivity and Decay Modes',
          initialMode: LearningMode.PRACTICE,
        });

      const sessionId = created.body.data.id;

      // Generate 10 full test MCQ questions
      const sampleQuestions = Array.from({ length: 10 }, (_, i) => ({
        questionNumber: i + 1,
        questionText: `What is the alpha decay energy equation for isotope ${i + 1}?`,
        options: [
          `Option A for Q${i + 1}`,
          `Option B for Q${i + 1}`,
          `Option C for Q${i + 1}`,
          `Option D for Q${i + 1}`,
        ],
        hint: `Think about mass conservation in reaction ${i + 1}`,
        solutionExplanation: `Detailed derivation showing Option ${(i % 4) + 1} is correct.`,
        correctOptionIndex: i % 4,
      }));

      // Seed in-progress batch with full questions into MongoDB
      await TopicSession.findByIdAndUpdate(sessionId, {
        $set: {
          'practiceState.batches.easy.status': BatchStatus.IN_PROGRESS,
          'practiceState.batches.easy.questions': sampleQuestions,
          'practiceState.batches.easy.score': null,
          'practiceState.batches.easy.userAnswers': [],
        },
      });

      // 1. Fetch while in_progress -> answers MUST be masked (BR-03)
      const inProgressRes = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(inProgressRes.status).toBe(200);
      const maskedBatch = inProgressRes.body.data.practiceState.batches.easy;
      expect(maskedBatch.status).toBe(BatchStatus.IN_PROGRESS);
      expect(maskedBatch.questions).toHaveLength(10);

      maskedBatch.questions.forEach((q: Record<string, unknown>, idx: number) => {
        expect(q.questionNumber).toBe(idx + 1);
        expect(q.questionText).toBeDefined();
        expect(q.options).toHaveLength(4);
        expect(q.hint).toBeDefined();

        // Critical BR-03 assertions: keys must NOT be present
        expect('correctOptionIndex' in q).toBe(false);
        expect('solutionExplanation' in q).toBe(false);
        expect(q.correctOptionIndex).toBeUndefined();
        expect(q.solutionExplanation).toBeUndefined();
      });

      // 2. Update to completed in MongoDB
      const completedAtDate = new Date();
      await TopicSession.findByIdAndUpdate(sessionId, {
        $set: {
          'practiceState.batches.easy.status': BatchStatus.COMPLETED,
          'practiceState.batches.easy.score': 8,
          'practiceState.batches.easy.userAnswers': [0, 1, 2, 3, 0, 1, 2, 3, 0, 1],
          'practiceState.batches.easy.completedAt': completedAtDate,
        },
      });

      // 3. Fetch after completion -> answers and explanations MUST be revealed
      const completedRes = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(completedRes.status).toBe(200);
      const revealedBatch = completedRes.body.data.practiceState.batches.easy;
      expect(revealedBatch.status).toBe(BatchStatus.COMPLETED);
      expect(revealedBatch.score).toBe(8);
      expect(revealedBatch.completedAt).toBe(completedAtDate.toISOString());
      expect(revealedBatch.questions).toHaveLength(10);

      revealedBatch.questions.forEach((q: Record<string, unknown>, idx: number) => {
        expect(q.questionNumber).toBe(idx + 1);
        expect('correctOptionIndex' in q).toBe(true);
        expect('solutionExplanation' in q).toBe(true);
        expect(q.correctOptionIndex).toBe(idx % 4);
        expect(q.solutionExplanation).toContain(`Detailed derivation showing Option ${(idx % 4) + 1} is correct.`);
      });
    });
  });

  describe('6. Delete Session (FR-006)', () => {
    it('deletes session and subsequent fetch returns 404 RESOURCE_NOT_FOUND', async () => {
      const user = await setupTestUser('Barbara Liskov', 'barbara@example.com');

      const created = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Liskov Substitution Principle',
          initialMode: LearningMode.EXPLAIN,
        });

      const sessionId = created.body.data.id;

      // Delete the session
      const deleteRes = await request(app)
        .delete(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);
      expect(deleteRes.body.data).toEqual({ deletedId: sessionId });

      // Verify it is gone
      const fetchRes = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(fetchRes.status).toBe(404);
      expect(fetchRes.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);

      // Verify list is now empty
      const listRes = await request(app)
        .get('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`);

      expect(listRes.body.data).toHaveLength(0);
    });

    it('returns 404 when attempting to delete a nonexistent session', async () => {
      const user = await setupTestUser('Barbara Liskov', 'barbara@example.com');
      const fakeId = new mongoose.Types.ObjectId().toString();

      const deleteRes = await request(app)
        .delete(`/api/v1/sessions/${fakeId}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(deleteRes.status).toBe(404);
      expect(deleteRes.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
    });
  });
});
