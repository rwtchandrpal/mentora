import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { GoogleGenAI } from '@google/genai';
import {
  EducationLevel,
  ExplanationStyle,
  LearningMode,
  PracticeTier,
  BatchStatus,
  ErrorCode,
  MCQ_BATCH_SIZE,
} from '@mentora/shared';
import { app } from '../app.js';
import { User } from '../models/User.model.js';
import { TopicSession } from '../models/TopicSession.model.js';
import { authService } from '../services/auth.service.js';
import { sessionRepository } from '../repositories/session.repository.js';
import {
  setGeminiClient,
  resetGeminiClient,
} from '../ai/gemini.client.js';

describe('IMP-022: Backend Practice Mode Service (Reasoning-First Generation, Masking, & O(1) Grading)', () => {
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
    resetGeminiClient();
    vi.restoreAllMocks();
    await TopicSession.deleteMany({});
    await User.deleteMany({});
  });

  const setupUser = async (
    name: string,
    email: string,
    completeProfile = true,
    quotaCount = 0
  ) => {
    const authData = await authService.register({
      name,
      email,
      password: 'password1234',
    });

    if (completeProfile) {
      await authService.updateProfile(authData.user.id, {
        educationLevel: EducationLevel.UNDERGRADUATE,
        preferredStyle: ExplanationStyle.VISUAL,
      });
    }

    if (quotaCount > 0) {
      await User.findByIdAndUpdate(authData.user.id, {
        $set: { 'usageQuota.dailyCount': quotaCount },
      });
    }

    return {
      userId: authData.user.id,
      token: authData.token,
    };
  };

  const createTestSession = async (
    userId: string,
    topicQuery = 'Binary Search Trees'
  ) => {
    return sessionRepository.create({
      userId,
      topicQuery,
      normalizedTitle: topicQuery,
      initialMode: LearningMode.PRACTICE,
    });
  };

  const createMockQuestions = () => {
    return Array.from({ length: MCQ_BATCH_SIZE }, (_, i) => ({
      questionNumber: i + 1,
      questionText: `Question ${i + 1}: What is the time complexity of operation ${i + 1}?`,
      options: [
        '$\\mathcal{O}(1)$',
        '$\\mathcal{O}(\\log n)$',
        '$\\mathcal{O}(n)$',
        '$\\mathcal{O}(n^2)$',
      ],
      hint: `Consider how the tree is partitioned at step ${i + 1}.`,
      solutionExplanation: `REASONING: By maintaining the binary search invariant, the search space halves at each depth level, resulting in $\\mathcal{O}(\\log n)$ balanced comparisons. Thus, Option index ${i % 4} is verified correct.`,
      correctOptionIndex: i % 4,
    }));
  };

  const mockPracticeBatchPayload = {
    isEducationalValid: true,
    normalizedTitle: 'Binary Search Trees',
    questions: createMockQuestions(),
  };

  describe('Batch Generation (POST /api/v1/sessions/:id/practice/generate)', () => {
    it('generates 10 MCQs for Easy tier, saves status = in_progress, increments quota, and masks answer keys (BR-03, FR-014, FR-017)', async () => {
      const user = await setupUser('Alice', 'alice@test.com');
      const session = await createTestSession(user.userId);

      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify(mockPracticeBatchPayload),
      });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.EASY });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);

      const sessionData = res.body.data;
      expect(sessionData.practiceState.activeTier).toBe(PracticeTier.EASY);
      expect(sessionData.lastActiveMode).toBe(LearningMode.PRACTICE);

      const easyBatch = sessionData.practiceState.batches.easy;
      expect(easyBatch.status).toBe(BatchStatus.IN_PROGRESS);
      expect(easyBatch.questions).toHaveLength(10);
      expect(easyBatch.score).toBeNull();
      expect(easyBatch.userAnswers).toEqual([]);

      // Verify BR-03 answer-key masking: correctOptionIndex and solutionExplanation MUST NOT be exposed in DTO
      for (const q of easyBatch.questions) {
        expect(q.questionNumber).toBeGreaterThanOrEqual(1);
        expect(q.questionText).toBeTruthy();
        expect(q.options).toHaveLength(4);
        expect(q.hint).toBeTruthy();
        expect((q as Record<string, unknown>).correctOptionIndex).toBeUndefined();
        expect((q as Record<string, unknown>).solutionExplanation).toBeUndefined();
      }

      // Verify quota was incremented
      expect(res.body.meta?.quota?.used).toBe(1);

      // Verify DB contains complete unmasked data with solutionExplanation preceding correctOptionIndex
      const dbSession = await TopicSession.findById(session._id);
      expect(dbSession).not.toBeNull();
      const dbEasyBatch = dbSession!.practiceState.batches.easy;
      expect(dbEasyBatch.status).toBe(BatchStatus.IN_PROGRESS);
      expect(dbEasyBatch.questions).toHaveLength(10);
      for (let i = 0; i < 10; i++) {
        const q = dbEasyBatch.questions[i];
        expect(q).toBeDefined();
        if (q) {
          expect(q.correctOptionIndex).toBe(i % 4);
          expect(q.solutionExplanation).toContain('REASONING:');
        }
      }
    });

    it('enforces sequential tier lock check: rejects Medium or Hard when prerequisite tier is locked (BR-02, AC-PRC-01)', async () => {
      const user = await setupUser('Bob', 'bob@test.com');
      const session = await createTestSession(user.userId);

      const mockGenerateContent = vi.fn();
      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      // Medium tier is locked because Easy is not completed
      const medRes = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.MEDIUM });

      expect(medRes.status).toBe(409);
      expect(medRes.body.success).toBe(false);
      expect(medRes.body.error.code).toBe(ErrorCode.TIER_LOCKED);
      expect(mockGenerateContent).not.toHaveBeenCalled();

      // Hard tier is locked
      const hardRes = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.HARD });

      expect(hardRes.status).toBe(409);
      expect(hardRes.body.success).toBe(false);
      expect(hardRes.body.error.code).toBe(ErrorCode.TIER_LOCKED);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('is idempotent: repeat generate calls return existing batch without re-billing quota or re-calling Gemini (BR-04)', async () => {
      const user = await setupUser('Charlie', 'charlie@test.com');
      const session = await createTestSession(user.userId);

      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify(mockPracticeBatchPayload),
      });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      // Call 1: Generates batch
      const res1 = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.EASY });

      expect(res1.status).toBe(200);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);

      // Call 2: Returns existing in_progress batch without re-calling Gemini
      const res2 = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.EASY });

      expect(res2.status).toBe(200);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1); // Still 1

      // Quota should still be 1 (not 2)
      const dbUser = await User.findById(user.userId);
      expect(dbUser!.usageQuota.dailyCount).toBe(1);
    });

    it('rejects invalid tier value with 400 VALIDATION_ERROR', async () => {
      const user = await setupUser('Dave', 'dave@test.com');
      const session = await createTestSession(user.userId);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: 'ultra_nightmare' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('blocks request with 403 PROFILE_INCOMPLETE if learner profile is not completed (BR-01)', async () => {
      const user = await setupUser('Eve', 'eve@test.com', false);
      const session = await createTestSession(user.userId);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.EASY });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.PROFILE_INCOMPLETE);
    });

    it('blocks request with 429 DAILY_QUOTA_EXCEEDED when daily quota is exhausted (BR-04)', async () => {
      const user = await setupUser('Frank', 'frank@test.com', true, 50);
      const session = await createTestSession(user.userId);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.EASY });

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.DAILY_QUOTA_EXCEEDED);
      expect(res.body.error.details?.resetAt).toBeDefined();
    });

    it('returns 422 EDUCATIONAL_GUARDRAIL_REFUSAL when model rejects non-educational or harmful topic (Edge Case 1, FR-018)', async () => {
      const user = await setupUser('Grace', 'grace@test.com');
      const session = await createTestSession(user.userId);

      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify({
          isEducationalValid: false,
          refusalReason: 'Mentora is exclusively dedicated to academic and technical subjects.',
          questions: [],
        }),
      });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.EASY });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.EDUCATIONAL_GUARDRAIL_REFUSAL);

      // Session batch remains not_started
      const dbSession = await TopicSession.findById(session._id);
      expect(dbSession!.practiceState.batches.easy.status).toBe(BatchStatus.NOT_STARTED);
    });
  });

  describe('Batch Submission & Deterministic Grading (POST /api/v1/sessions/:id/practice/submit)', () => {
    it('grades 10 MCQs in O(1) time without calling an LLM, reveals rationales, and unlocks Medium tier (FR-016, BR-02, BR-03, AC-PRC-02, AC-PRC-03)', async () => {
      const user = await setupUser('Hank', 'hank@test.com');
      const session = await createTestSession(user.userId);

      // Pre-populate Easy batch in in_progress state with correctOptionIndex = i % 4
      session.practiceState.activeTier = PracticeTier.EASY;
      session.practiceState.batches.easy.status = BatchStatus.IN_PROGRESS;
      session.practiceState.batches.easy.questions = createMockQuestions();
      await sessionRepository.save(session);

      const mockGemini = vi.fn();
      setGeminiClient({
        models: { generateContent: mockGemini },
      } as unknown as GoogleGenAI);

      // Submit answers: 8 correct, 2 wrong
      // Correct indices: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1]
      // Submitted:       [0, 1, 2, 3, 0, 1, 2, 3, 3, 3] -> Question 9 (0 vs 3) and Question 10 (1 vs 3) are incorrect
      const answers = [0, 1, 2, 3, 0, 1, 2, 3, 3, 3];

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          tier: PracticeTier.EASY,
          answers,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // CRITICAL: NEVER call an LLM to grade submissions
      expect(mockGemini).not.toHaveBeenCalled();

      const sessionData = res.body.data;
      const easyBatch = sessionData.practiceState.batches.easy;

      expect(easyBatch.status).toBe(BatchStatus.COMPLETED);
      if (easyBatch.status === BatchStatus.COMPLETED) {
        expect(easyBatch.score).toBe(8);
        expect(easyBatch.userAnswers).toEqual(answers);
        expect(easyBatch.completedAt).not.toBeNull();

        // Verify full review unmasking: correctOptionIndex and solutionExplanation are now visible (AC-PRC-02)
        for (let i = 0; i < 10; i++) {
          const q = easyBatch.questions[i];
          expect(q).toBeDefined();
          if (q) {
            expect(q.correctOptionIndex).toBe(i % 4);
            expect(q.solutionExplanation).toContain('REASONING:');
          }
        }
      }

      // Verify sequential tier unlocking (AC-PRC-03, BR-02): Medium tier is now not_started (was locked)
      expect(sessionData.practiceState.batches.medium.status).toBe(BatchStatus.NOT_STARTED);
      expect(sessionData.practiceState.batches.hard.status).toBe(BatchStatus.LOCKED);

      // Verify submission did NOT consume user quota (BR-04)
      const dbUser = await User.findById(user.userId);
      expect(dbUser!.usageQuota.dailyCount).toBe(0);
    });

    it('rejects submissions with fewer than 10 answers with 400 VALIDATION_ERROR (BR-03)', async () => {
      const user = await setupUser('Ian', 'ian@test.com');
      const session = await createTestSession(user.userId);

      session.practiceState.batches.easy.status = BatchStatus.IN_PROGRESS;
      session.practiceState.batches.easy.questions = createMockQuestions();
      await sessionRepository.save(session);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          tier: PracticeTier.EASY,
          answers: [0, 1, 2, 3], // Only 4 answers
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('rejects submissions with invalid option values (< 0 or > 3) with 400 VALIDATION_ERROR', async () => {
      const user = await setupUser('Jack', 'jack@test.com');
      const session = await createTestSession(user.userId);

      session.practiceState.batches.easy.status = BatchStatus.IN_PROGRESS;
      session.practiceState.batches.easy.questions = createMockQuestions();
      await sessionRepository.save(session);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          tier: PracticeTier.EASY,
          answers: [0, 1, 2, 3, 4, 1, 2, 3, 0, 1], // Option index 4 is invalid
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('rejects submitting a batch that has not been generated yet with 400 VALIDATION_ERROR', async () => {
      const user = await setupUser('Kate', 'kate@test.com');
      const session = await createTestSession(user.userId);

      // Easy is not_started with 0 questions
      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          tier: PracticeTier.EASY,
          answers: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('rejects submitting a locked tier with 409 TIER_LOCKED', async () => {
      const user = await setupUser('Leo', 'leo@test.com');
      const session = await createTestSession(user.userId);

      // Medium is locked
      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          tier: PracticeTier.MEDIUM,
          answers: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1],
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.TIER_LOCKED);
    });

    it('allows submission even when user has exhausted their 50/50 daily quota (BR-04)', async () => {
      const user = await setupUser('Mia', 'mia@test.com', true, 50);
      const session = await createTestSession(user.userId);

      session.practiceState.batches.easy.status = BatchStatus.IN_PROGRESS;
      session.practiceState.batches.easy.questions = createMockQuestions();
      await sessionRepository.save(session);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          tier: PracticeTier.EASY,
          answers: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.practiceState.batches.easy.status).toBe(BatchStatus.COMPLETED);
      expect(res.body.data.practiceState.batches.easy.score).toBe(10);
    });

    it('unlocks Hard tier when Medium batch is submitted (BR-02, AC-PRC-03)', async () => {
      const user = await setupUser('Nora', 'nora@test.com');
      const session = await createTestSession(user.userId);

      // Pre-set Easy completed and Medium in_progress
      session.practiceState.batches.easy.status = BatchStatus.COMPLETED;
      session.practiceState.batches.easy.score = 9;
      session.practiceState.batches.easy.questions = createMockQuestions();
      session.practiceState.batches.medium.status = BatchStatus.IN_PROGRESS;
      session.practiceState.batches.medium.questions = createMockQuestions();
      session.practiceState.batches.hard.status = BatchStatus.LOCKED;
      await sessionRepository.save(session);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          tier: PracticeTier.MEDIUM,
          answers: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const sessionData = res.body.data;
      expect(sessionData.practiceState.batches.medium.status).toBe(BatchStatus.COMPLETED);
      expect(sessionData.practiceState.batches.hard.status).toBe(BatchStatus.NOT_STARTED);
    });

    it('enforces multi-tenant isolation: foreign users receive 404 RESOURCE_NOT_FOUND (NFR-005)', async () => {
      const userOwner = await setupUser('Owner', 'owner@test.com');
      const userAttacker = await setupUser('Attacker', 'attacker@test.com');
      const session = await createTestSession(userOwner.userId);

      session.practiceState.batches.easy.status = BatchStatus.IN_PROGRESS;
      session.practiceState.batches.easy.questions = createMockQuestions();
      await sessionRepository.save(session);

      // Attacker attempts to generate
      const genRes = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/generate`)
        .set('Authorization', `Bearer ${userAttacker.token}`)
        .send({ tier: PracticeTier.EASY });

      expect(genRes.status).toBe(404);
      expect(genRes.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);

      // Attacker attempts to submit
      const subRes = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/practice/submit`)
        .set('Authorization', `Bearer ${userAttacker.token}`)
        .send({
          tier: PracticeTier.EASY,
          answers: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1],
        });

      expect(subRes.status).toBe(404);
      expect(subRes.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
    });
  });

  describe('Direct PracticeService Unit Tests', () => {
    it('throws 404 RESOURCE_NOT_FOUND if session does not exist on generateBatch or submitBatch', async () => {
      const user = await setupUser('NonExistent', 'nonexistent@test.com');
      const fakeSessionId = new mongoose.Types.ObjectId().toString();

      const { practiceService } = await import('../services/practice.service.js');

      await expect(
        practiceService.generateBatch(user.userId, fakeSessionId, PracticeTier.EASY)
      ).rejects.toThrowError(/Topic session not found/);

      await expect(
        practiceService.submitBatch(user.userId, fakeSessionId, PracticeTier.EASY, [
          0, 1, 2, 3, 0, 1, 2, 3, 0, 1,
        ])
      ).rejects.toThrowError(/Topic session not found/);
    });

    it('throws 400 VALIDATION_ERROR if answers array contains non-integers or invalid values', async () => {
      const user = await setupUser('Validator', 'validator@test.com');
      const session = await createTestSession(user.userId);

      session.practiceState.batches.easy.status = BatchStatus.IN_PROGRESS;
      session.practiceState.batches.easy.questions = createMockQuestions();
      await sessionRepository.save(session);

      const { practiceService } = await import('../services/practice.service.js');

      // Negative value
      await expect(
        practiceService.submitBatch(user.userId, session._id.toString(), PracticeTier.EASY, [
          -1, 1, 2, 3, 0, 1, 2, 3, 0, 1,
        ])
      ).rejects.toThrowError(/must be an integer between 0 and 3/);

      // Value > 3
      await expect(
        practiceService.submitBatch(user.userId, session._id.toString(), PracticeTier.EASY, [
          4, 1, 2, 3, 0, 1, 2, 3, 0, 1,
        ])
      ).rejects.toThrowError(/must be an integer between 0 and 3/);

      // Non-integer
      await expect(
        practiceService.submitBatch(user.userId, session._id.toString(), PracticeTier.EASY, [
          1.5, 1, 2, 3, 0, 1, 2, 3, 0, 1,
        ])
      ).rejects.toThrowError(/must be an integer between 0 and 3/);
    });
  });
});
