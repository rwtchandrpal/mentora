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
  type TopicSessionDTO,
} from '@mentora/shared';
import { app } from '../app.js';
import { User } from '../models/User.model.js';
import { TopicSession } from '../models/TopicSession.model.js';
import {
  setGeminiClient,
  resetGeminiClient,
} from '../ai/gemini.client.js';

describe('IMP-024: Backend End-to-End Practice Mode Progression (Easy -> Medium -> Hard)', () => {
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

  const setupTestUser = async (
    name: string,
    email: string,
    educationLevel = EducationLevel.UNDERGRADUATE,
    preferredStyle = ExplanationStyle.VISUAL
  ) => {
    // 1. Register user
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name,
        email,
        password: 'password1234',
      });
    expect(regRes.status).toBe(201);
    const token = regRes.body.data.token as string;
    const userId = regRes.body.data.user.id as string;

    // 2. Complete learner profile
    const profileRes = await request(app)
      .put('/api/v1/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        educationLevel,
        preferredStyle,
      });
    expect(profileRes.status).toBe(200);

    return { userId, token };
  };

  const createMockQuestionsForTier = (tier: PracticeTier) => {
    return Array.from({ length: MCQ_BATCH_SIZE }, (_, i) => ({
      questionNumber: i + 1,
      questionText: `[${tier.toUpperCase()}] Question ${i + 1}: What is the time complexity of operation ${i + 1}?`,
      options: [
        '$\\mathcal{O}(1)$',
        '$\\mathcal{O}(\\log n)$',
        '$\\mathcal{O}(n)$',
        '$\\mathcal{O}(n^2)$',
      ],
      hint: `[${tier.toUpperCase()}] Hint for question ${i + 1}: consider tree partitioning.`,
      solutionExplanation: `REASONING: In ${tier} tier, operation ${i + 1} divides the candidate space logarithmically, yielding option index ${i % 4}.`,
      correctOptionIndex: i % 4,
    }));
  };

  describe('1. Full 30-Question Tier Progression & Quota Accounting (AC-PRC-01..03, BR-02..04)', () => {
    it('executes full ladder: Easy generation -> submit -> Medium unlock & generation -> submit -> Hard unlock & generation -> submit -> 30-question summary', async () => {
      const user = await setupTestUser('Donald Knuth', 'knuth@example.com');

      // Step A: Create TopicSession starting in Practice Mode
      const createRes = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Binary Search Trees & Balancing',
          initialMode: LearningMode.PRACTICE,
          autoInitialize: false,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      const session = createRes.body.data as TopicSessionDTO;
      const sessionId = session.id;

      expect(session.lastActiveMode).toBe(LearningMode.PRACTICE);
      expect(session.practiceState.activeTier).toBe(PracticeTier.EASY);
      expect(session.practiceState.batches.easy.status).toBe(BatchStatus.NOT_STARTED);
      expect(session.practiceState.batches.medium.status).toBe(BatchStatus.LOCKED);
      expect(session.practiceState.batches.hard.status).toBe(BatchStatus.LOCKED);
      expect(createRes.body.meta?.quota?.used).toBe(0);

      // Step B: Sequential Tier Lock Check (BR-02, AC-PRC-01)
      // Attempting to generate Medium or Hard before completing Easy must fail with 409 TIER_LOCKED
      const earlyMediumRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.MEDIUM });
      expect(earlyMediumRes.status).toBe(409);
      expect(earlyMediumRes.body.error.code).toBe(ErrorCode.TIER_LOCKED);

      const earlyHardRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.HARD });
      expect(earlyHardRes.status).toBe(409);
      expect(earlyHardRes.body.error.code).toBe(ErrorCode.TIER_LOCKED);

      // Step C: Generate Easy Batch (10 MCQs)
      const easyQuestions = createMockQuestionsForTier(PracticeTier.EASY);
      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify({
          isEducationalValid: true,
          normalizedTitle: 'Binary Search Trees & Balancing',
          questions: easyQuestions,
        }),
      });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      const generateEasyRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.EASY });

      expect(generateEasyRes.status).toBe(200);
      expect(generateEasyRes.body.success).toBe(true);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);

      const easyBatchInProgress = generateEasyRes.body.data.practiceState.batches.easy;
      expect(easyBatchInProgress.status).toBe(BatchStatus.IN_PROGRESS);
      expect(easyBatchInProgress.questions).toHaveLength(10);
      expect(easyBatchInProgress.score).toBeNull();
      expect(easyBatchInProgress.userAnswers).toEqual([]);

      // Verify BR-03 answer-key masking: correctOptionIndex and solutionExplanation are stripped
      for (const q of easyBatchInProgress.questions) {
        expect(q.questionNumber).toBeGreaterThanOrEqual(1);
        expect(q.questionText).toBeTruthy();
        expect(q.options).toHaveLength(4);
        expect(q.hint).toBeTruthy();
        expect((q as Record<string, unknown>).correctOptionIndex).toBeUndefined();
        expect((q as Record<string, unknown>).solutionExplanation).toBeUndefined();
      }

      // Quota incremented by 1 for Easy generation
      expect(generateEasyRes.body.meta?.quota?.used).toBe(1);

      // Step D: Verify GET /api/v1/sessions/:id masks in-progress answers
      const getSessionRes1 = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${user.token}`);
      expect(getSessionRes1.status).toBe(200);
      const fetchedEasy = getSessionRes1.body.data.practiceState.batches.easy;
      expect(fetchedEasy.status).toBe(BatchStatus.IN_PROGRESS);
      expect((fetchedEasy.questions[0] as Record<string, unknown>).correctOptionIndex).toBeUndefined();
      expect((fetchedEasy.questions[0] as Record<string, unknown>).solutionExplanation).toBeUndefined();

      // Step E: Verify Submit validation (fewer than 10 answers rejected per BR-03)
      const invalidSubmitRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          tier: PracticeTier.EASY,
          answers: [0, 1, 2, 3], // Only 4 answers
        });
      expect(invalidSubmitRes.status).toBe(400);
      expect(invalidSubmitRes.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);

      // Step F: Submit 10 answers for Easy Batch (all match i % 4 -> 10/10)
      const easyAnswers = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1];
      const submitEasyRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          tier: PracticeTier.EASY,
          answers: easyAnswers,
        });

      expect(submitEasyRes.status).toBe(200);
      expect(submitEasyRes.body.success).toBe(true);

      const easyBatchCompleted = submitEasyRes.body.data.practiceState.batches.easy;
      expect(easyBatchCompleted.status).toBe(BatchStatus.COMPLETED);
      expect(easyBatchCompleted.score).toBe(10);
      expect(easyBatchCompleted.userAnswers).toEqual(easyAnswers);
      expect(easyBatchCompleted.completedAt).toBeTruthy();

      // Full explanations and correct options now revealed!
      for (let i = 0; i < 10; i++) {
        const q = easyBatchCompleted.questions[i];
        expect(q.correctOptionIndex).toBe(i % 4);
        expect(q.solutionExplanation).toContain('REASONING:');
      }

      // Medium batch is unlocked ('not_started') per AC-PRC-03, Hard is still locked
      expect(submitEasyRes.body.data.practiceState.batches.medium.status).toBe(BatchStatus.NOT_STARTED);
      expect(submitEasyRes.body.data.practiceState.batches.hard.status).toBe(BatchStatus.LOCKED);

      // Quota is NOT incremented on submit (BR-04)
      const dbUserAfterEasy = await User.findById(user.userId);
      expect(dbUserAfterEasy?.usageQuota.dailyCount).toBe(1);

      // Step G: Generate Medium Batch
      const mediumQuestions = createMockQuestionsForTier(PracticeTier.MEDIUM);
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          isEducationalValid: true,
          normalizedTitle: 'Binary Search Trees & Balancing',
          questions: mediumQuestions,
        }),
      });

      const generateMedRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.MEDIUM });

      expect(generateMedRes.status).toBe(200);
      expect(generateMedRes.body.data.practiceState.batches.medium.status).toBe(BatchStatus.IN_PROGRESS);
      expect(generateMedRes.body.data.practiceState.batches.medium.questions).toHaveLength(10);
      // Quota incremented to 2
      expect(generateMedRes.body.meta?.quota?.used).toBe(2);

      // Attempting to generate Hard before completing Medium still fails
      const earlyHardRes2 = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.HARD });
      expect(earlyHardRes2.status).toBe(409);
      expect(earlyHardRes2.body.error.code).toBe(ErrorCode.TIER_LOCKED);

      // Step H: Submit Medium Batch (9/10 score: question 10 answer is 3 instead of 1)
      const mediumAnswers = [0, 1, 2, 3, 0, 1, 2, 3, 0, 3];
      const submitMedRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          tier: PracticeTier.MEDIUM,
          answers: mediumAnswers,
        });

      expect(submitMedRes.status).toBe(200);
      const medBatchCompleted = submitMedRes.body.data.practiceState.batches.medium;
      expect(medBatchCompleted.status).toBe(BatchStatus.COMPLETED);
      expect(medBatchCompleted.score).toBe(9);
      expect(medBatchCompleted.userAnswers).toEqual(mediumAnswers);

      // Hard batch is now unlocked ('not_started')
      expect(submitMedRes.body.data.practiceState.batches.hard.status).toBe(BatchStatus.NOT_STARTED);
      // Quota is NOT incremented on submit (BR-04)
      const dbUserAfterMed = await User.findById(user.userId);
      expect(dbUserAfterMed?.usageQuota.dailyCount).toBe(2);

      // Step I: Generate Hard Batch
      const hardQuestions = createMockQuestionsForTier(PracticeTier.HARD);
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          isEducationalValid: true,
          normalizedTitle: 'Binary Search Trees & Balancing',
          questions: hardQuestions,
        }),
      });

      const generateHardRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.HARD });

      expect(generateHardRes.status).toBe(200);
      expect(generateHardRes.body.data.practiceState.batches.hard.status).toBe(BatchStatus.IN_PROGRESS);
      expect(generateHardRes.body.data.practiceState.batches.hard.questions).toHaveLength(10);
      // Quota incremented to 3
      expect(generateHardRes.body.meta?.quota?.used).toBe(3);

      // Step J: Submit Hard Batch (8/10 score: questions 9 and 10 answered with 3)
      const hardAnswers = [0, 1, 2, 3, 0, 1, 2, 3, 3, 3];
      const submitHardRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          tier: PracticeTier.HARD,
          answers: hardAnswers,
        });

      expect(submitHardRes.status).toBe(200);
      const hardBatchCompleted = submitHardRes.body.data.practiceState.batches.hard;
      expect(hardBatchCompleted.status).toBe(BatchStatus.COMPLETED);
      expect(hardBatchCompleted.score).toBe(8);
      expect(hardBatchCompleted.userAnswers).toEqual(hardAnswers);

      // Quota across entire 30-question ladder is exactly 3 (only for the 3 generation calls)
      const dbUserAfterHard = await User.findById(user.userId);
      expect(dbUserAfterHard?.usageQuota.dailyCount).toBe(3);

      // Verify all 3 tiers are completed with scores 10, 9, 8
      const finalPracticeState = submitHardRes.body.data.practiceState;
      expect(finalPracticeState.batches.easy.score).toBe(10);
      expect(finalPracticeState.batches.medium.score).toBe(9);
      expect(finalPracticeState.batches.hard.score).toBe(8);
      const totalScore =
        (finalPracticeState.batches.easy.score || 0) +
        (finalPracticeState.batches.medium.score || 0) +
        (finalPracticeState.batches.hard.score || 0);
      expect(totalScore).toBe(27); // 27 / 30 (90%)
    });
  });

  describe('2. Session Persistence & Reload Restoration (FR-006)', () => {
    it('restores all 30 completed questions, user choices, step-by-step explanations, and scores upon session reload', async () => {
      const user = await setupTestUser('Grace Hopper', 'hopper@example.com');

      // Create session
      const createRes = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Compilers and Lexical Analysis',
          initialMode: LearningMode.PRACTICE,
          autoInitialize: false,
        });
      const sessionId = createRes.body.data.id as string;

      // Mock Gemini for Easy, Medium, Hard
      const mockGenerateContent = vi.fn();
      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      // Complete Easy
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          isEducationalValid: true,
          questions: createMockQuestionsForTier(PracticeTier.EASY),
        }),
      });
      await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.EASY });
      await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.EASY, answers: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1] });

      // Complete Medium
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          isEducationalValid: true,
          questions: createMockQuestionsForTier(PracticeTier.MEDIUM),
        }),
      });
      await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.MEDIUM });
      await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.MEDIUM, answers: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1] });

      // Complete Hard
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          isEducationalValid: true,
          questions: createMockQuestionsForTier(PracticeTier.HARD),
        }),
      });
      await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.HARD });
      await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.HARD, answers: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1] });

      // Now simulate a full reload by fetching GET /api/v1/sessions/:id
      const reloadRes = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(reloadRes.status).toBe(200);
      const sessionData = reloadRes.body.data as TopicSessionDTO;

      const { easy, medium, hard } = sessionData.practiceState.batches;
      expect(easy.status).toBe(BatchStatus.COMPLETED);
      if (easy.status === BatchStatus.COMPLETED) {
        expect(easy.score).toBe(10);
        expect(easy.questions).toHaveLength(10);
        const q0 = easy.questions[0];
        expect(q0).toBeDefined();
        if (q0) {
          expect(q0.correctOptionIndex).toBe(0);
          expect(q0.solutionExplanation).toContain('REASONING:');
        }
      }

      expect(medium.status).toBe(BatchStatus.COMPLETED);
      if (medium.status === BatchStatus.COMPLETED) {
        expect(medium.score).toBe(10);
        expect(medium.questions).toHaveLength(10);
        const q1 = medium.questions[1];
        expect(q1).toBeDefined();
        if (q1) {
          expect(q1.correctOptionIndex).toBe(1);
        }
      }

      expect(hard.status).toBe(BatchStatus.COMPLETED);
      if (hard.status === BatchStatus.COMPLETED) {
        expect(hard.score).toBe(10);
        expect(hard.questions).toHaveLength(10);
        const q2 = hard.questions[2];
        expect(q2).toBeDefined();
        if (q2) {
          expect(q2.correctOptionIndex).toBe(2);
        }
      }
    });
  });

  describe('3. Educational Guardrail Refusal Integrity (Edge Case 1, FR-018)', () => {
    it('returns 422 EDUCATIONAL_GUARDRAIL_REFUSAL and leaves batch in not_started state without billing quota when topic violates guardrails', async () => {
      const user = await setupTestUser('Safe Learner', 'safe@example.com');

      const createRes = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'How to bypass security locks',
          initialMode: LearningMode.PRACTICE,
          autoInitialize: false,
        });
      const sessionId = createRes.body.data.id as string;

      // Model returns isEducationalValid = false
      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify({
          isEducationalValid: false,
          refusalReason: 'Mentora is calibrated exclusively for educational learning concepts.',
          questions: [],
        }),
      });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      const generateRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.EASY });

      expect(generateRes.status).toBe(422);
      expect(generateRes.body.success).toBe(false);
      expect(generateRes.body.error.code).toBe(ErrorCode.EDUCATIONAL_GUARDRAIL_REFUSAL);
      expect(generateRes.body.error.message).toContain('Mentora is calibrated exclusively');

      // Verify DB session was not corrupted: Easy batch remains not_started
      const dbSession = await TopicSession.findById(sessionId);
      expect(dbSession?.practiceState.batches.easy.status).toBe(BatchStatus.NOT_STARTED);
      expect(dbSession?.practiceState.batches.easy.questions).toHaveLength(0);

      // Verify user quota was NOT incremented (remains 0)
      const dbUser = await User.findById(user.userId);
      expect(dbUser?.usageQuota.dailyCount).toBe(0);
    });
  });

  describe('4. Multi-Tenant Isolation Across All Practice Actions (NFR-005)', () => {
    it('returns 404 RESOURCE_NOT_FOUND when foreign user attempts to generate or submit another user session', async () => {
      const userA = await setupTestUser('User A', 'usera@example.com');
      const userB = await setupTestUser('User B', 'userb@example.com');

      // User A creates session
      const createRes = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          topicQuery: 'Dynamic Programming & Memoization',
          initialMode: LearningMode.PRACTICE,
          autoInitialize: false,
        });
      const sessionId = createRes.body.data.id as string;

      // User B attempts to view User A's session
      const viewRes = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${userB.token}`);
      expect(viewRes.status).toBe(404);
      expect(viewRes.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);

      // User B attempts to generate Easy batch for User A's session
      const foreignGenRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/generate`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ tier: PracticeTier.EASY });
      expect(foreignGenRes.status).toBe(404);
      expect(foreignGenRes.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);

      // User B attempts to submit answers for User A's session
      const foreignSubmitRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/submit`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({
          tier: PracticeTier.EASY,
          answers: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1],
        });
      expect(foreignSubmitRes.status).toBe(404);
      expect(foreignSubmitRes.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
    });
  });

  describe('5. Idempotent Generation & Re-Billing Prevention', () => {
    it('returns existing batch without calling Gemini or incrementing quota when re-generating an in_progress batch', async () => {
      const user = await setupTestUser('Idempotent User', 'idempotent@example.com');
      const createRes = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Graph Traversal Algorithms',
          initialMode: LearningMode.PRACTICE,
          autoInitialize: false,
        });
      const sessionId = createRes.body.data.id as string;

      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify({
          isEducationalValid: true,
          questions: createMockQuestionsForTier(PracticeTier.EASY),
        }),
      });
      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      // First generate call -> calls Gemini, quota = 1
      const gen1Res = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.EASY });
      expect(gen1Res.status).toBe(200);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);

      // Second generate call -> does NOT call Gemini, does NOT increment quota
      const gen2Res = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.EASY });
      expect(gen2Res.status).toBe(200);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);

      const dbUser = await User.findById(user.userId);
      expect(dbUser?.usageQuota.dailyCount).toBe(1);
    });
  });
});
