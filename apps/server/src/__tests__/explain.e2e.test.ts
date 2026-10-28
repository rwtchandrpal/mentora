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
import {
  setGeminiClient,
  resetGeminiClient,
} from '../ai/gemini.client.js';

describe('IMP-018: End-to-End Explain Mode Workflow & Acceptance Criteria Verification', () => {
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

  const registerAndProfileUser = async (
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

  const mockExplainInitPayload = {
    isEducationalValid: true,
    normalizedTitle: 'Deadlocks in Operating Systems',
    cards: [
      {
        stepNumber: 1,
        stepType: ExplainStepType.INTUITION,
        title: 'The Four-Way Traffic Gridlock',
        contentMarkdown:
          'Imagine four cars arriving at an intersection simultaneously, each waiting on the car to its right.',
        checkQuestion: null,
        checkAnswer: null,
        deepDives: [],
      },
      {
        stepNumber: 2,
        stepType: ExplainStepType.CORE_MECHANISM,
        title: "Coffman's Four Invariants",
        contentMarkdown:
          'A deadlock occurs if and only if all four conditions hold: Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait.',
        checkQuestion: null,
        checkAnswer: null,
        deepDives: [],
      },
      {
        stepNumber: 3,
        stepType: ExplainStepType.EXAMPLE,
        title: 'Dining Philosophers Code Scenario',
        contentMarkdown:
          '```c\nvoid philosopher(int i) {\n  wait(chopstick[i]);\n  wait(chopstick[(i+1)%5]);\n  eat();\n}\n```',
        checkQuestion: null,
        checkAnswer: null,
        deepDives: [],
      },
      {
        stepNumber: 4,
        stepType: ExplainStepType.CHECK_FOR_UNDERSTANDING,
        title: 'CFU: Breaking Circular Wait',
        contentMarkdown:
          'Consider how assigning global hierarchical order to all resources prevents circular wait.',
        checkQuestion:
          'If resources are numbered $1..N$ and processes must request them in strictly increasing order, can a deadlock occur?',
        checkAnswer:
          'No, strict monotonic resource ordering mathematically guarantees a cycle cannot form in the Resource Allocation Graph.',
        deepDives: [],
      },
    ],
    suggestedSubTopics: [
      "Banker's Algorithm",
      'Resource Allocation Graphs',
      'Lock Ordering Deadlock Prevention',
    ],
  };

  const mockDeepDivePayload = {
    title: 'Formal Proof of Cycle Prevention via Partial Order',
    contentMarkdown:
      'Assume a cycle exists: $P_0 \\rightarrow R_1 \\rightarrow P_1 \\rightarrow \\dots \\rightarrow R_k \\rightarrow P_0$. By monotonic index ordering, $index(R_1) < index(R_2) < \\dots < index(R_k) < index(R_1)$, which is a contradiction.',
  };

  describe('1. Full Lifecycle: Journey 1 (AC-EXP-01, AC-EXP-02, AC-EXP-03, BR-04)', () => {
    it('executes topic creation -> 4-card progressive reveal -> stepping -> deeper expansion with accurate quota tracking', async () => {
      const user = await registerAndProfileUser(
        'Alan Turing',
        'alan@example.com',
        EducationLevel.UNDERGRADUATE,
        ExplanationStyle.VISUAL
      );

      // 1. Create session via POST /api/v1/sessions with initialMode: 'explain'
      const createRes = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Deadlocks in Operating Systems',
          initialMode: LearningMode.EXPLAIN,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      const session = createRes.body.data;
      expect(session.topicQuery).toBe('Deadlocks in Operating Systems');
      expect(session.lastActiveMode).toBe(LearningMode.EXPLAIN);
      expect(session.explainState.status).toBe(ExplainStatus.NOT_STARTED);
      expect(session.explainState.currentStepIndex).toBe(0);
      expect(session.explainState.cards).toHaveLength(0);

      // Verify quota is NOT consumed by session creation
      const userAfterCreate = await User.findById(user.userId);
      expect(userAfterCreate?.usageQuota.dailyCount).toBe(0);

      // 2. Initialize Explain Mode via POST /api/v1/sessions/:id/explain/init
      const mockGenerateContent = vi.fn().mockImplementation(async () => ({
        text: JSON.stringify(mockExplainInitPayload),
      }));

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      const initRes = await request(app)
        .post(`/api/v1/sessions/${session.id}/explain/init`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(initRes.status).toBe(200);
      expect(initRes.body.success).toBe(true);
      expect(initRes.body.data.explainState.status).toBe(ExplainStatus.READY);
      expect(initRes.body.data.explainState.currentStepIndex).toBe(0);
      expect(initRes.body.data.explainState.cards).toHaveLength(4);
      expect(initRes.body.data.explainState.suggestedSubTopics).toEqual([
        "Banker's Algorithm",
        'Resource Allocation Graphs',
        'Lock Ordering Deadlock Prevention',
      ]);
      expect(initRes.body.meta.quota.used).toBe(1);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);

      // Verify DB quota was incremented exactly once
      const userAfterInit = await User.findById(user.userId);
      expect(userAfterInit?.usageQuota.dailyCount).toBe(1);

      // 3. Idempotency Check: Calling /explain/init again returns ready state with 0 additional quota charged
      const initAgainRes = await request(app)
        .post(`/api/v1/sessions/${session.id}/explain/init`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(initAgainRes.status).toBe(200);
      expect(initAgainRes.body.data.explainState.status).toBe(ExplainStatus.READY);
      expect(initAgainRes.body.data.explainState.cards).toHaveLength(4);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1); // Not called again!
      const userAfterInitAgain = await User.findById(user.userId);
      expect(userAfterInitAgain?.usageQuota.dailyCount).toBe(1); // Quota remains 1

      // 4. Step through cards: Next 1 -> 2 -> 3 (AC-EXP-02)
      // Step to Card 2 (stepIndex: 1)
      const step1Res = await request(app)
        .patch(`/api/v1/sessions/${session.id}/explain/step`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepIndex: 1 });

      expect(step1Res.status).toBe(200);
      expect(step1Res.body.data.explainState.currentStepIndex).toBe(1);

      // Step to Card 3 (stepIndex: 2)
      const step2Res = await request(app)
        .patch(`/api/v1/sessions/${session.id}/explain/step`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepIndex: 2 });

      expect(step2Res.status).toBe(200);
      expect(step2Res.body.data.explainState.currentStepIndex).toBe(2);

      // Step to Card 4 (stepIndex: 3)
      const step3Res = await request(app)
        .patch(`/api/v1/sessions/${session.id}/explain/step`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepIndex: 3 });

      expect(step3Res.status).toBe(200);
      expect(step3Res.body.data.explainState.currentStepIndex).toBe(3);

      // Verify stepping did NOT consume any daily quota (BR-04)
      const userAfterStepping = await User.findById(user.userId);
      expect(userAfterStepping?.usageQuota.dailyCount).toBe(1);

      // 5. Trigger Go Deeper on Step 2 (Core Mechanism) (AC-EXP-03)
      const mockDeeperGenerateContent = vi.fn().mockImplementation(async () => ({
        text: JSON.stringify(mockDeepDivePayload),
      }));

      setGeminiClient({
        models: { generateContent: mockDeeperGenerateContent },
      } as unknown as GoogleGenAI);

      const deeperRes = await request(app)
        .post(`/api/v1/sessions/${session.id}/explain/deeper`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepNumber: 2 });

      expect(deeperRes.status).toBe(200);
      expect(deeperRes.body.success).toBe(true);
      // currentStepIndex is preserved at 3
      expect(deeperRes.body.data.explainState.currentStepIndex).toBe(3);

      // Card 2 now has exactly 1 deep-dive sub-card
      const card2 = deeperRes.body.data.explainState.cards.find(
        (c: { stepNumber: number }) => c.stepNumber === 2
      );
      expect(card2.deepDives).toHaveLength(1);
      expect(card2.deepDives[0].depthLevel).toBe(1);
      expect(card2.deepDives[0].title).toBe(
        'Formal Proof of Cycle Prevention via Partial Order'
      );
      expect(card2.deepDives[0].contentMarkdown).toContain('contradiction');

      // Daily quota increments to 2
      expect(deeperRes.body.meta.quota.used).toBe(2);
      const userAfterDeeper = await User.findById(user.userId);
      expect(userAfterDeeper?.usageQuota.dailyCount).toBe(2);
    });
  });

  describe('2. Session Persistence & Sidebar History Reload (FR-006, Journey 3)', () => {
    it('persists all cards, deep-dives, currentStepIndex, and sub-topics, restoring them identically across sessions', async () => {
      const user = await registerAndProfileUser(
        'Ada Lovelace',
        'ada@example.com'
      );

      // Setup session with ready explain state & deep dive
      const createRes = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Deadlocks in Operating Systems',
          initialMode: LearningMode.EXPLAIN,
        });
      const sessionId = createRes.body.data.id;

      setGeminiClient({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: JSON.stringify(mockExplainInitPayload),
          }),
        },
      } as unknown as GoogleGenAI);

      await request(app)
        .post(`/api/v1/sessions/${sessionId}/explain/init`)
        .set('Authorization', `Bearer ${user.token}`);

      await request(app)
        .patch(`/api/v1/sessions/${sessionId}/explain/step`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepIndex: 3 });

      setGeminiClient({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: JSON.stringify(mockDeepDivePayload),
          }),
        },
      } as unknown as GoogleGenAI);

      await request(app)
        .post(`/api/v1/sessions/${sessionId}/explain/deeper`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepNumber: 2 });

      // 1. Fetch sessions list (Left History Sidebar)
      const listRes = await request(app)
        .get('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].id).toBe(sessionId);
      expect(listRes.body.data[0].normalizedTitle).toBe(
        'Deadlocks in Operating Systems'
      );
      expect(listRes.body.data[0].lastActiveMode).toBe(LearningMode.EXPLAIN);

      // 2. Fetch full session by ID (Direct session reload / browser refresh)
      const getRes = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.success).toBe(true);
      const restored = getRes.body.data;

      expect(restored.id).toBe(sessionId);
      expect(restored.explainState.status).toBe(ExplainStatus.READY);
      expect(restored.explainState.currentStepIndex).toBe(3);
      expect(restored.explainState.cards).toHaveLength(4);
      expect(restored.explainState.suggestedSubTopics).toEqual([
        "Banker's Algorithm",
        'Resource Allocation Graphs',
        'Lock Ordering Deadlock Prevention',
      ]);

      const restoredCard2 = restored.explainState.cards[1];
      expect(restoredCard2.deepDives).toHaveLength(1);
      expect(restoredCard2.deepDives[0].title).toBe(
        'Formal Proof of Cycle Prevention via Partial Order'
      );
    });
  });

  describe('3. Educational Guardrail Refusal (Edge Case 1)', () => {
    it('returns 422 EDUCATIONAL_GUARDRAIL_REFUSAL and leaves session in uncorrupted not_started state', async () => {
      const user = await registerAndProfileUser(
        'Grace Hopper',
        'grace@example.com'
      );

      const createRes = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'How to bypass physical lock mechanisms',
          initialMode: LearningMode.EXPLAIN,
        });
      const sessionId = createRes.body.data.id;

      // Mock refusal output from Gemini
      setGeminiClient({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: JSON.stringify({
              isEducationalValid: false,
              refusalReason:
                'Physical security bypass instructions are non-educational and violate safety guidelines.',
            }),
          }),
        },
      } as unknown as GoogleGenAI);

      const initRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/explain/init`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(initRes.status).toBe(422);
      expect(initRes.body.success).toBe(false);
      expect(initRes.body.error.code).toBe(
        ErrorCode.EDUCATIONAL_GUARDRAIL_REFUSAL
      );
      expect(initRes.body.error.message).toContain(
        'Physical security bypass instructions'
      );

      // Verify MongoDB session state remains 'not_started' and cards array is empty
      const dbSession = await TopicSession.findById(sessionId);
      expect(dbSession?.explainState.status).toBe(ExplainStatus.NOT_STARTED);
      expect(dbSession?.explainState.cards).toHaveLength(0);
    });
  });

  describe('4. Multi-Tenant Ownership Isolation (NFR-005)', () => {
    it('prevents foreign users from initializing, stepping, or deep-diving another user session', async () => {
      const owner = await registerAndProfileUser('Owner', 'owner@example.com');
      const intruder = await registerAndProfileUser(
        'Intruder',
        'intruder@example.com'
      );

      const createRes = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          topicQuery: 'Private Research Topic',
          initialMode: LearningMode.EXPLAIN,
        });
      const sessionId = createRes.body.data.id;

      // Intruder attempts init
      const intruderInit = await request(app)
        .post(`/api/v1/sessions/${sessionId}/explain/init`)
        .set('Authorization', `Bearer ${intruder.token}`);
      expect(intruderInit.status).toBe(404);
      expect(intruderInit.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);

      // Intruder attempts step
      const intruderStep = await request(app)
        .patch(`/api/v1/sessions/${sessionId}/explain/step`)
        .set('Authorization', `Bearer ${intruder.token}`)
        .send({ stepIndex: 1 });
      expect(intruderStep.status).toBe(404);
      expect(intruderStep.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);

      // Intruder attempts deep-dive
      const intruderDeeper = await request(app)
        .post(`/api/v1/sessions/${sessionId}/explain/deeper`)
        .set('Authorization', `Bearer ${intruder.token}`)
        .send({ stepNumber: 1 });
      expect(intruderDeeper.status).toBe(404);
      expect(intruderDeeper.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);

      // Intruder attempts GET session
      const intruderGet = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${intruder.token}`);
      expect(intruderGet.status).toBe(404);
      expect(intruderGet.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
    });
  });
});

