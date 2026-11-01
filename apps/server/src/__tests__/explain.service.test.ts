import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { GoogleGenAI } from '@google/genai';
import {
  EducationLevel,
  ExplanationStyle,
  LearningMode,
  ExplainStatus,
  ExplainStepType,
  ErrorCode,
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

describe('IMP-016: Backend Explain Mode Service & Endpoints (FR-007, FR-008, BR-04, AC-EXP-01–03)', () => {
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
    topicQuery = 'Binary Search Algorithm'
  ) => {
    return sessionRepository.create({
      userId,
      topicQuery,
      normalizedTitle: topicQuery,
      initialMode: LearningMode.EXPLAIN,
    });
  };

  const mockExplainInitPayload = {
    isEducationalValid: true,
    normalizedTitle: 'Binary Search Algorithm',
    cards: [
      {
        stepNumber: 1,
        stepType: ExplainStepType.INTUITION,
        title: 'Divide and Conquer Intuition',
        contentMarkdown:
          'Think of searching for a word in a physical dictionary by opening to the middle.',
        checkQuestion: null,
        checkAnswer: null,
        deepDives: [],
      },
      {
        stepNumber: 2,
        stepType: ExplainStepType.CORE_MECHANISM,
        title: 'Sorted Invariant & Halving',
        contentMarkdown:
          'Maintain pointers $L$ and $R$. The midpoint is $M = \\lfloor (L + R) / 2 \\rfloor$. Halves search space each iteration: $\\mathcal{O}(\\log n)$.',
        checkQuestion: null,
        checkAnswer: null,
        deepDives: [],
      },
      {
        stepNumber: 3,
        stepType: ExplainStepType.EXAMPLE,
        title: 'Step-by-Step Array Walkthrough',
        contentMarkdown:
          '```typescript\nfunction binarySearch(arr: number[], target: number): number {\n  let l = 0, r = arr.length - 1;\n  while (l <= r) {\n    const m = Math.floor((l + r) / 2);\n    if (arr[m] === target) return m;\n    if (arr[m] < target) l = m + 1;\n    else r = m - 1;\n  }\n  return -1;\n}\n```',
        checkQuestion: null,
        checkAnswer: null,
        deepDives: [],
      },
      {
        stepNumber: 4,
        stepType: ExplainStepType.CHECK_FOR_UNDERSTANDING,
        title: 'CFU: Integer Overflow & Unsorted Inputs',
        contentMarkdown:
          'Reflect on why binary search fails if the input array is not sorted.',
        checkQuestion: 'What is the time complexity if the array is unsorted?',
        checkAnswer:
          'Binary search yields incorrect results on unsorted inputs; linear search $\\mathcal{O}(n)$ is required.',
        deepDives: [],
      },
    ],
    suggestedSubTopics: ['Exponential Search', 'Ternary Search', 'Order-Agnostic Binary Search'],
  };

  const mockExplainDeeperPayload = {
    title: 'Midpoint Overflow Avoidance & Bitwise Halving',
    contentMarkdown:
      'In systems with 32-bit signed integers, `(L + R) / 2` can overflow when $L + R > 2^{31} - 1$. Instead, calculate $M = L + \\lfloor (R - L) / 2 \\rfloor$ or `(L + R) >>> 1`.',
  };

  describe('1. Explain Mode 4-Card Progressive Initialization (AC-EXP-01, FR-007)', () => {
    it('initializes 4 progressive cards with currentStepIndex = 0 and increments quota', async () => {
      const user = await setupUser('Marie Curie', 'marie@example.com');
      const session = await createTestSession(user.userId);

      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify(mockExplainInitPayload),
      });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/init`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);

      const sessionData = res.body.data;
      expect(sessionData.explainState.status).toBe(ExplainStatus.READY);
      expect(sessionData.explainState.currentStepIndex).toBe(0);
      expect(sessionData.explainState.cards).toHaveLength(4);

      // Verify 4-step sequence
      expect(sessionData.explainState.cards[0].stepType).toBe(ExplainStepType.INTUITION);
      expect(sessionData.explainState.cards[1].stepType).toBe(ExplainStepType.CORE_MECHANISM);
      expect(sessionData.explainState.cards[2].stepType).toBe(ExplainStepType.EXAMPLE);
      expect(sessionData.explainState.cards[3].stepType).toBe(ExplainStepType.CHECK_FOR_UNDERSTANDING);
      expect(sessionData.explainState.cards[3].checkQuestion).toBe(
        'What is the time complexity if the array is unsorted?'
      );
      expect(sessionData.explainState.cards[3].checkAnswer).toBe(
        'Binary search yields incorrect results on unsorted inputs; linear search $\\mathcal{O}(n)$ is required.'
      );
      expect(sessionData.explainState.cards[3].checkAnswer).not.toContain('Circular Wait');

      // Verify quota was incremented
      expect(res.body.meta?.quota?.used).toBe(1);

      const dbUser = await User.findById(user.userId);
      expect(dbUser?.usageQuota.dailyCount).toBe(1);
    });

    it('returns existing state idempotently if explainState.status === ready without calling Gemini or incrementing quota', async () => {
      const user = await setupUser('Ada Lovelace', 'ada@example.com');
      const session = await createTestSession(user.userId);

      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify(mockExplainInitPayload),
      });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      // Call 1: initializes
      const firstRes = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/init`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(firstRes.status).toBe(200);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);

      // Call 2: idempotent return
      const secondRes = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/init`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.success).toBe(true);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1); // not called again!

      const dbUser = await User.findById(user.userId);
      expect(dbUser?.usageQuota.dailyCount).toBe(1); // quota count remains 1!
    });
  });

  describe('2. Step Progression Controls (AC-EXP-02, FR-008, BR-04)', () => {
    it('advances currentStepIndex from 0 to 1 without incrementing user quota', async () => {
      const user = await setupUser('Alan Turing', 'alan@example.com');
      const session = await createTestSession(user.userId);

      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify(mockExplainInitPayload),
      });
      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/init`)
        .set('Authorization', `Bearer ${user.token}`);

      // Advance step to 1 using stepIndex
      const stepRes1 = await request(app)
        .patch(`/api/v1/sessions/${session._id.toString()}/explain/step`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepIndex: 1 });

      expect(stepRes1.status).toBe(200);
      expect(stepRes1.body.success).toBe(true);
      expect(stepRes1.body.data.explainState.currentStepIndex).toBe(1);

      // Advance step to 2 using currentStepIndex
      const stepRes2 = await request(app)
        .patch(`/api/v1/sessions/${session._id.toString()}/explain/step`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentStepIndex: 2 });

      expect(stepRes2.status).toBe(200);
      expect(stepRes2.body.data.explainState.currentStepIndex).toBe(2);

      // Advance step to 3
      const stepRes3 = await request(app)
        .patch(`/api/v1/sessions/${session._id.toString()}/explain/step`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepIndex: 3 });

      expect(stepRes3.status).toBe(200);
      expect(stepRes3.body.data.explainState.currentStepIndex).toBe(3);

      // CRITICAL (BR-04): Quota count MUST remain 1
      const dbUser = await User.findById(user.userId);
      expect(dbUser?.usageQuota.dailyCount).toBe(1);
    });

    it('rejects stepIndex out of bounds (< 0 or > 3) with 400 VALIDATION_ERROR', async () => {
      const user = await setupUser('Grace Hopper', 'grace@example.com');
      const session = await createTestSession(user.userId);

      const resBelow = await request(app)
        .patch(`/api/v1/sessions/${session._id.toString()}/explain/step`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepIndex: -1 });

      expect(resBelow.status).toBe(400);
      expect(resBelow.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);

      const resAbove = await request(app)
        .patch(`/api/v1/sessions/${session._id.toString()}/explain/step`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentStepIndex: 4 });

      expect(resAbove.status).toBe(400);
      expect(resAbove.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);

      const resNonInt = await request(app)
        .patch(`/api/v1/sessions/${session._id.toString()}/explain/step`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepIndex: 1.5 });

      expect(resNonInt.status).toBe(400);
      expect(resNonInt.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe('3. "Go Deeper" Sub-Card Generation (AC-EXP-03, FR-008, BR-04)', () => {
    it('generates and appends a DeepDiveSubCard under target card, preserves currentStepIndex, and increments quota', async () => {
      const user = await setupUser('Katherine Johnson', 'katherine@example.com');
      const session = await createTestSession(user.userId);

      let callCount = 0;
      const mockGenerateContent = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { text: JSON.stringify(mockExplainInitPayload) };
        }
        return { text: JSON.stringify(mockExplainDeeperPayload) };
      });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      // Initialize
      await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/init`)
        .set('Authorization', `Bearer ${user.token}`);

      // Advance to step 1
      await request(app)
        .patch(`/api/v1/sessions/${session._id.toString()}/explain/step`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepIndex: 1 });

      // Generate Go Deeper for Step 2 (Core Mechanism)
      const deeperRes = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/deeper`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepNumber: 2 });

      expect(deeperRes.status).toBe(200);
      expect(deeperRes.body.success).toBe(true);

      const sessionData = deeperRes.body.data;
      // AC-EXP-03: currentStepIndex preserved
      expect(sessionData.explainState.currentStepIndex).toBe(1);

      // Deep dive sub-card appended under card 2
      const card2 = sessionData.explainState.cards[1];
      expect(card2.deepDives).toHaveLength(1);
      expect(card2.deepDives[0].depthLevel).toBe(1);
      expect(card2.deepDives[0].title).toBe('Midpoint Overflow Avoidance & Bitwise Halving');
      expect(card2.deepDives[0].id).toBeDefined();

      // Quota incremented to 2
      expect(deeperRes.body.meta?.quota?.used).toBe(2);
      const dbUser = await User.findById(user.userId);
      expect(dbUser?.usageQuota.dailyCount).toBe(2);
    });

    it('enforces MAX_DEEP_DIVE_DEPTH = 2 on repeated deep dives on the same card', async () => {
      const user = await setupUser('Margaret Hamilton', 'margaret@example.com');
      const session = await createTestSession(user.userId);

      const mockGenerateContent = vi.fn().mockImplementation(async (req) => {
        if (req.model.includes('flash')) {
          return { text: JSON.stringify(mockExplainInitPayload) };
        }
        return { text: JSON.stringify(mockExplainDeeperPayload) };
      });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/init`)
        .set('Authorization', `Bearer ${user.token}`);

      // Deep dive 1 (depth 1)
      const d1 = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/deeper`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepNumber: 2 });
      expect(d1.status).toBe(200);
      expect(d1.body.data.explainState.cards[1].deepDives).toHaveLength(1);

      // Deep dive 2 (depth 2)
      const d2 = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/deeper`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepNumber: 2 });
      expect(d2.status).toBe(200);
      expect(d2.body.data.explainState.cards[1].deepDives).toHaveLength(2);

      // Deep dive 3: MUST fail with 400 VALIDATION_ERROR
      const d3 = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/deeper`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepNumber: 2 });
      expect(d3.status).toBe(400);
      expect(d3.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(d3.body.error.message).toContain('Maximum deep-dive depth');
    });

    it('rejects invalid stepNumber (< 1 or > 4) with 400 VALIDATION_ERROR', async () => {
      const user = await setupUser('Barbara Liskov', 'barbara@example.com');
      const session = await createTestSession(user.userId);

      const resZero = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/deeper`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepNumber: 0 });

      expect(resZero.status).toBe(400);
      expect(resZero.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);

      const resFive = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/deeper`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepNumber: 5 });

      expect(resFive.status).toBe(400);
      expect(resFive.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('rejects deep dive if explain mode has not been initialized for session', async () => {
      const user = await setupUser('Claude Shannon', 'claude@example.com');
      const session = await createTestSession(user.userId);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/deeper`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepNumber: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(res.body.error.message).toContain('Explain mode has not been initialized');
    });
  });

  describe('4. Multi-Tenant User Isolation (NFR-005)', () => {
    it('returns 404 RESOURCE_NOT_FOUND when user attempts to access another user session', async () => {
      const userA = await setupUser('User A', 'userA@example.com');
      const userB = await setupUser('User B', 'userB@example.com');
      const sessionA = await createTestSession(userA.userId);

      // User B tries to call /init on User A's session
      const resInit = await request(app)
        .post(`/api/v1/sessions/${sessionA._id.toString()}/explain/init`)
        .set('Authorization', `Bearer ${userB.token}`);

      expect(resInit.status).toBe(404);
      expect(resInit.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);

      // User B tries to call /step on User A's session
      const resStep = await request(app)
        .patch(`/api/v1/sessions/${sessionA._id.toString()}/explain/step`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ stepIndex: 1 });

      expect(resStep.status).toBe(404);
      expect(resStep.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);

      // User B tries to call /deeper on User A's session
      const resDeeper = await request(app)
        .post(`/api/v1/sessions/${sessionA._id.toString()}/explain/deeper`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ stepNumber: 1 });

      expect(resDeeper.status).toBe(404);
      expect(resDeeper.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
    });
  });

  describe('5. Daily Quota Enforcement (BR-04)', () => {
    it('blocks /init and /deeper with 429 DAILY_QUOTA_EXCEEDED when quota is exhausted, while /step remains allowed', async () => {
      const exhaustedUser = await setupUser('Exhausted User', 'exhausted@example.com', true, 50);
      const session = await createTestSession(exhaustedUser.userId);

      // 1. /init is blocked by quotaMiddleware
      const resInit = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/init`)
        .set('Authorization', `Bearer ${exhaustedUser.token}`);

      expect(resInit.status).toBe(429);
      expect(resInit.body.error.code).toBe(ErrorCode.DAILY_QUOTA_EXCEEDED);
      expect(resInit.body.error.details.used).toBe(50);

      // 2. /deeper is blocked by quotaMiddleware
      const resDeeper = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/deeper`)
        .set('Authorization', `Bearer ${exhaustedUser.token}`)
        .send({ stepNumber: 1 });

      expect(resDeeper.status).toBe(429);
      expect(resDeeper.body.error.code).toBe(ErrorCode.DAILY_QUOTA_EXCEEDED);

      // 3. /step is a local progression control and MUST NOT be blocked by quota (BR-04)
      const resStep = await request(app)
        .patch(`/api/v1/sessions/${session._id.toString()}/explain/step`)
        .set('Authorization', `Bearer ${exhaustedUser.token}`)
        .send({ stepIndex: 2 });

      expect(resStep.status).toBe(200);
      expect(resStep.body.data.explainState.currentStepIndex).toBe(2);
    });
  });

  describe('6. Educational Scope Guardrails (FR-018, Edge Case 1)', () => {
    it('returns 422 EDUCATIONAL_GUARDRAIL_REFUSAL when model returns isEducationalValid = false', async () => {
      const user = await setupUser('Test Student', 'student@example.com');
      const session = await createTestSession(user.userId, 'How to write a keylogger');

      const refusalPayload = {
        isEducationalValid: false,
        refusalReason:
          'Mentora is an academic AI tutor. Creating malicious software falls outside our educational scope.',
        cards: [],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify(refusalPayload),
      });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/init`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.EDUCATIONAL_GUARDRAIL_REFUSAL);
      expect(res.body.error.message).toContain('academic AI tutor');

      // Verify explainState was NOT marked ready
      const dbSession = await TopicSession.findById(session._id);
      expect(dbSession?.explainState.status).toBe(ExplainStatus.NOT_STARTED);
    });
  });

  describe('7. Auth & Profile Guards (BR-01)', () => {
    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const user = await setupUser('Valid User', 'valid@example.com');
      const session = await createTestSession(user.userId);

      const res = await request(app).post(
        `/api/v1/sessions/${session._id.toString()}/explain/init`
      );

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('rejects requests from users with incomplete profile with 403 PROFILE_INCOMPLETE (BR-01)', async () => {
      const incompleteUser = await setupUser(
        'Incomplete User',
        'incomplete@example.com',
        false
      );
      const session = await createTestSession(incompleteUser.userId);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/explain/init`)
        .set('Authorization', `Bearer ${incompleteUser.token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.PROFILE_INCOMPLETE);
    });
  });
});

