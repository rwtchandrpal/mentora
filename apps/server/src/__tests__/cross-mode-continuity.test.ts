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
  InteractStatus,
  PracticeTier,
  BatchStatus,
  ErrorCode,
  DAILY_AI_QUOTA_LIMIT,
  MCQ_BATCH_SIZE,
  type TopicSessionDTO,
} from '@mentora/shared';
import { app } from '../app.js';
import { User } from '../models/User.model.js';
import { TopicSession } from '../models/TopicSession.model.js';
import { authService } from '../services/auth.service.js';
import {
  setGeminiClient,
  resetGeminiClient,
} from '../ai/gemini.client.js';

describe('IMP-025: Cross-Mode Session Continuity & Quota Exhaustion Read-Only Verification (FR-004–FR-006, BR-01–BR-04)', () => {
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
    preferredStyle = ExplanationStyle.CONCISE_TECHNICAL
  ) => {
    const authData = await authService.register({
      name,
      email,
      password: 'password1234',
    });

    await authService.updateProfile(authData.user.id, {
      educationLevel,
      preferredStyle,
    });

    return {
      userId: authData.user.id,
      token: authData.token,
    };
  };

  const mockExplainInitPayload = {
    isEducationalValid: true,
    normalizedTitle: 'Operating System Deadlocks',
    cards: [
      {
        stepNumber: 1,
        stepType: ExplainStepType.INTUITION,
        title: 'Traffic Gridlock Intuition',
        contentMarkdown: 'Imagine a four-way intersection where every car is blocked by the car to its right.',
        checkQuestion: null,
        checkAnswer: null,
        deepDives: [],
      },
      {
        stepNumber: 2,
        stepType: ExplainStepType.CORE_MECHANISM,
        title: "Coffman's Four Conditions",
        contentMarkdown: 'Mutual exclusion, hold and wait, no preemption, and circular wait: $\\forall i, P_i \\rightarrow R_i$.',
        checkQuestion: null,
        checkAnswer: null,
        deepDives: [],
      },
      {
        stepNumber: 3,
        stepType: ExplainStepType.EXAMPLE,
        title: 'Dining Philosophers Example',
        contentMarkdown: 'Five philosophers competing for adjacent chopsticks.',
        checkQuestion: null,
        checkAnswer: null,
        deepDives: [],
      },
      {
        stepNumber: 4,
        stepType: ExplainStepType.CHECK_FOR_UNDERSTANDING,
        title: 'Check for Understanding',
        contentMarkdown: 'Can deadlock occur if resources are numbered and acquired in strict monotonic order?',
        checkQuestion: 'Does monotonic resource ordering eliminate circular wait?',
        checkAnswer: 'Yes, because cycles require an edge from higher to lower numbered resources.',
        deepDives: [],
      },
    ],
    suggestedSubTopics: ["Banker's Algorithm", 'Resource Allocation Graph'],
  };

  const mockDeepDivePayload = {
    title: 'Mathematical Proof of Monotonic Lock Ordering',
    contentMarkdown: 'Assume a cycle exists: $R_1 < R_2 < \\dots < R_k < R_1$, which contradicts transitivity of strict inequality.',
  };

  const mockInteractInitPayload = {
    isEducationalValid: true,
    normalizedTitle: 'Operating System Deadlocks',
    milestones: [
      {
        milestoneNumber: 1,
        title: 'Identify Resource Contention',
        description: 'Understand how threads compete for exclusive resources.',
      },
      {
        milestoneNumber: 2,
        title: 'Analyze Circular Wait',
        description: 'Trace dependency cycles in resource allocation graphs.',
      },
      {
        milestoneNumber: 3,
        title: 'Implement Deadlock Prevention',
        description: 'Apply lock hierarchies to eliminate circular wait.',
      },
    ],
    openingQuestion: 'In a multithreaded database, how could two transactions executing concurrently cause a deadlock?',
  };

  const mockInteractStreamChunk =
    '<<MENTORA_STATE:{"outcome":"STRIKE"}>>\nGreat observation! Now think about what happens when Transaction A holds Lock 1 and requests Lock 2.';

  const createMockPracticeQuestions = (tier: PracticeTier) => {
    return Array.from({ length: MCQ_BATCH_SIZE }, (_, i) => ({
      questionNumber: i + 1,
      questionText: `[${tier.toUpperCase()}] Question ${i + 1}: Which condition describes processes holding resources while requesting new ones?`,
      options: ['Hold and Wait', 'Mutual Exclusion', 'No Preemption', 'Circular Wait'],
      hint: `Hint for question ${i + 1}: Consider threads retaining locks while blocked.`,
      solutionExplanation: `REASONING: Option 0 ('Hold and Wait') defines retaining existing resources while requesting additional ones.`,
      correctOptionIndex: 0,
    }));
  };

  const mockPracticeGeneratePayload = {
    isEducationalValid: true,
    normalizedTitle: 'Operating System Deadlocks',
    questions: createMockPracticeQuestions(PracticeTier.EASY),
  };

  describe('1. Direct Mode Initialization via Unified POST /api/v1/sessions Dispatcher (FR-004)', () => {
    it('initializes Explain Mode immediately when initialMode is explain, consuming 1 quota and returning 4 cards', async () => {
      const user = await setupTestUser('Explain Starter', 'explain_starter@example.com');

      setGeminiClient({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: JSON.stringify(mockExplainInitPayload),
          }),
        },
      } as unknown as GoogleGenAI);

      const res = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Operating System Deadlocks',
          initialMode: LearningMode.EXPLAIN,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const session = res.body.data as TopicSessionDTO;
      expect(session.topicQuery).toBe('Operating System Deadlocks');
      expect(session.lastActiveMode).toBe(LearningMode.EXPLAIN);
      expect(session.explainState.status).toBe(ExplainStatus.READY);
      expect(session.explainState.currentStepIndex).toBe(0);
      expect(session.explainState.cards).toHaveLength(4);
      expect(session.explainState.cards[0]?.title).toBe('Traffic Gridlock Intuition');
      expect(session.explainState.suggestedSubTopics).toEqual(["Banker's Algorithm", 'Resource Allocation Graph']);

      // Unstarted modes remain clean
      expect(session.interactState.status).toBe(InteractStatus.NOT_STARTED);
      expect(session.practiceState.batches.easy.status).toBe(BatchStatus.NOT_STARTED);

      // Quota consumed: 1
      expect(res.body.meta?.quota?.used).toBe(1);
      const dbUser = await User.findById(user.userId);
      expect(dbUser?.usageQuota.dailyCount).toBe(1);
    });

    it('initializes Interact Mode immediately when initialMode is interact, consuming 1 quota and setting 3-5 milestones', async () => {
      const user = await setupTestUser('Interact Starter', 'interact_starter@example.com');

      setGeminiClient({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: JSON.stringify(mockInteractInitPayload),
          }),
        },
      } as unknown as GoogleGenAI);

      const res = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Operating System Deadlocks',
          initialMode: LearningMode.INTERACT,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const session = res.body.data as TopicSessionDTO;
      expect(session.topicQuery).toBe('Operating System Deadlocks');
      expect(session.lastActiveMode).toBe(LearningMode.INTERACT);
      expect(session.interactState.status).toBe(InteractStatus.ACTIVE);
      expect(session.interactState.activeMilestoneIndex).toBe(0);
      expect(session.interactState.strikeCount).toBe(0);
      expect(session.interactState.milestones).toHaveLength(3);
      expect(session.interactState.milestones[0]?.status).toBe('active');
      expect(session.interactState.messages).toHaveLength(1);
      expect(session.interactState.messages[0]?.role).toBe('assistant');
      expect(session.interactState.messages[0]?.content).toContain('how could two transactions');

      // Unstarted modes remain clean
      expect(session.explainState.status).toBe(ExplainStatus.NOT_STARTED);
      expect(session.practiceState.batches.easy.status).toBe(BatchStatus.NOT_STARTED);

      // Quota consumed: 1
      expect(res.body.meta?.quota?.used).toBe(1);
      const dbUser = await User.findById(user.userId);
      expect(dbUser?.usageQuota.dailyCount).toBe(1);
    });

    it('initializes Practice Mode immediately when initialMode is practice, generating 10 masked MCQs with Easy in_progress and Medium/Hard locked', async () => {
      const user = await setupTestUser('Practice Starter', 'practice_starter@example.com');

      setGeminiClient({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: JSON.stringify(mockPracticeGeneratePayload),
          }),
        },
      } as unknown as GoogleGenAI);

      const res = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Operating System Deadlocks',
          initialMode: LearningMode.PRACTICE,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const session = res.body.data as TopicSessionDTO;
      expect(session.topicQuery).toBe('Operating System Deadlocks');
      expect(session.lastActiveMode).toBe(LearningMode.PRACTICE);
      expect(session.practiceState.activeTier).toBe(PracticeTier.EASY);
      expect(session.practiceState.batches.easy.status).toBe(BatchStatus.IN_PROGRESS);
      expect(session.practiceState.batches.easy.questions).toHaveLength(MCQ_BATCH_SIZE);

      // BR-03: Answer keys masked during in_progress
      session.practiceState.batches.easy.questions.forEach((q) => {
        expect((q as { correctOptionIndex?: number }).correctOptionIndex).toBeUndefined();
        expect((q as { solutionExplanation?: string }).solutionExplanation).toBeUndefined();
        expect(q.options).toHaveLength(4);
        expect(q.hint).toBeTruthy();
      });

      // BR-02: Medium and Hard are locked
      expect(session.practiceState.batches.medium.status).toBe(BatchStatus.LOCKED);
      expect(session.practiceState.batches.hard.status).toBe(BatchStatus.LOCKED);

      // Unstarted modes remain clean
      expect(session.explainState.status).toBe(ExplainStatus.NOT_STARTED);
      expect(session.interactState.status).toBe(InteractStatus.NOT_STARTED);

      // Quota consumed: 1
      expect(res.body.meta?.quota?.used).toBe(1);
      const dbUser = await User.findById(user.userId);
      expect(dbUser?.usageQuota.dailyCount).toBe(1);
    });

    it('cleans up orphan session cleanly and does not bill quota when AI guardrail refuses the topic with 422', async () => {
      const user = await setupTestUser('Guardrail Refusal User', 'refusal@example.com');

      setGeminiClient({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: JSON.stringify({
              isEducationalValid: false,
              refusalReason: 'Bypassing vehicle alarms is non-educational and violates safety policies.',
            }),
          }),
        },
      } as unknown as GoogleGenAI);

      const res = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'How to disable car alarm circuits illegally',
          initialMode: LearningMode.EXPLAIN,
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.EDUCATIONAL_GUARDRAIL_REFUSAL);

      // Verify no orphan session document exists in MongoDB
      const count = await TopicSession.countDocuments({ userId: user.userId });
      expect(count).toBe(0);

      // Verify user quota was NOT consumed
      const dbUser = await User.findById(user.userId);
      expect(dbUser?.usageQuota.dailyCount).toBe(0);
    });

    it('cleans up orphan session cleanly and does not bill quota when AI upstream fails with 502', async () => {
      const user = await setupTestUser('Upstream Failure User', 'upstream_fail@example.com');

      setGeminiClient({
        models: {
          generateContent: vi.fn().mockRejectedValue(new Error('Simulated upstream AI gateway timeout')),
        },
      } as unknown as GoogleGenAI);

      const res = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Distributed Systems Invariants',
          initialMode: LearningMode.EXPLAIN,
        });

      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.AI_UPSTREAM_FAILURE);

      // Verify no orphan session exists in MongoDB
      const count = await TopicSession.countDocuments({ userId: user.userId });
      expect(count).toBe(0);

      // Verify user quota was NOT consumed
      const dbUser = await User.findById(user.userId);
      expect(dbUser?.usageQuota.dailyCount).toBe(0);
    });
  });

  describe('2. Seamless Cross-Mode State Preservation (FR-005, FR-006)', () => {
    it('preserves all state across Explain, Interact, and Practice modes on a single session without state loss', async () => {
      const user = await setupTestUser('Multi-Mode Scholar', 'scholar@example.com');

      // Setup multi-call mock for Gemini
      const mockGenerateContent = vi.fn();
      const mockGenerateContentStream = vi.fn().mockImplementation(async function* () {
        yield { text: mockInteractStreamChunk };
      });

      setGeminiClient({
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: mockGenerateContentStream,
        },
      } as unknown as GoogleGenAI);

      // Step 1: Create session directly in Explain mode
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(mockExplainInitPayload),
      });

      const createRes = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Operating System Deadlocks',
          initialMode: LearningMode.EXPLAIN,
        });

      expect(createRes.status).toBe(201);
      const sessionId = createRes.body.data.id as string;
      expect(createRes.body.data.explainState.status).toBe(ExplainStatus.READY);
      expect(createRes.body.data.explainState.currentStepIndex).toBe(0);

      // Step 2: Advance Explain step to stepIndex: 2
      const stepRes = await request(app)
        .patch(`/api/v1/sessions/${sessionId}/explain/step`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepIndex: 2 });

      expect(stepRes.status).toBe(200);
      expect(stepRes.body.data.explainState.currentStepIndex).toBe(2);

      // Step 3: Generate Go Deeper sub-card under Step 2
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(mockDeepDivePayload),
      });

      const deeperRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/explain/deeper`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepNumber: 2 });

      expect(deeperRes.status).toBe(200);
      const card2 = deeperRes.body.data.explainState.cards.find(
        (c: { stepNumber: number }) => c.stepNumber === 2
      );
      expect(card2?.deepDives).toHaveLength(1);
      expect(card2?.deepDives[0]?.title).toBe('Mathematical Proof of Monotonic Lock Ordering');

      // Step 4: Switch tab to Interact Mode
      const switchModeRes1 = await request(app)
        .patch(`/api/v1/sessions/${sessionId}/mode`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ mode: LearningMode.INTERACT });

      expect(switchModeRes1.status).toBe(200);
      expect(switchModeRes1.body.data.lastActiveMode).toBe(LearningMode.INTERACT);

      // Step 5: Initialize Interact Mode
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(mockInteractInitPayload),
      });

      const interactInitRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/interact/init`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(interactInitRes.status).toBe(200);
      expect(interactInitRes.body.data.interactState.status).toBe(InteractStatus.ACTIVE);
      expect(interactInitRes.body.data.interactState.milestones).toHaveLength(3);

      // Step 6: Complete an SSE turn in Interact Mode
      const sseRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/interact/stream`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ message: 'Threads form a closed circular wait dependency.' });

      expect(sseRes.status).toBe(200);
      expect(sseRes.text).toContain('event: metadata');

      // Step 7: Switch tab to Practice Mode
      const switchModeRes2 = await request(app)
        .patch(`/api/v1/sessions/${sessionId}/mode`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ mode: LearningMode.PRACTICE });

      expect(switchModeRes2.status).toBe(200);
      expect(switchModeRes2.body.data.lastActiveMode).toBe(LearningMode.PRACTICE);

      // Step 8: Generate Easy Practice batch
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(mockPracticeGeneratePayload),
      });

      const practiceGenRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.EASY });

      expect(practiceGenRes.status).toBe(200);
      expect(practiceGenRes.body.data.practiceState.batches.easy.status).toBe(BatchStatus.IN_PROGRESS);
      expect(practiceGenRes.body.data.practiceState.batches.easy.questions).toHaveLength(10);

      // Step 9: Reload session via GET /api/v1/sessions/:id (Simulating Left History Sidebar click)
      const reloadRes = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(reloadRes.status).toBe(200);
      expect(reloadRes.body.success).toBe(true);

      const reloaded = reloadRes.body.data as TopicSessionDTO;

      // Verify Explain State intact
      expect(reloaded.explainState.status).toBe(ExplainStatus.READY);
      expect(reloaded.explainState.currentStepIndex).toBe(2);
      expect(reloaded.explainState.cards).toHaveLength(4);
      const reloadedCard2 = reloaded.explainState.cards.find((c) => c.stepNumber === 2);
      expect(reloadedCard2?.deepDives).toHaveLength(1);
      expect(reloadedCard2?.deepDives[0]?.title).toBe('Mathematical Proof of Monotonic Lock Ordering');

      // Verify Interact State intact
      expect(reloaded.interactState.status).toBe(InteractStatus.ACTIVE);
      expect(reloaded.interactState.milestones).toHaveLength(3);
      expect(reloaded.interactState.messages.length).toBeGreaterThanOrEqual(2); // opening + user + assistant
      expect(reloaded.interactState.strikeCount).toBe(1); // STRIKE outcome from mock

      // Verify Practice State intact & answers masked
      expect(reloaded.practiceState.batches.easy.status).toBe(BatchStatus.IN_PROGRESS);
      expect(reloaded.practiceState.batches.easy.questions).toHaveLength(10);
      reloaded.practiceState.batches.easy.questions.forEach((q) => {
        expect((q as { correctOptionIndex?: number }).correctOptionIndex).toBeUndefined();
        expect((q as { solutionExplanation?: string }).solutionExplanation).toBeUndefined();
      });
      expect(reloaded.practiceState.batches.medium.status).toBe(BatchStatus.LOCKED);
      expect(reloaded.practiceState.batches.hard.status).toBe(BatchStatus.LOCKED);
    });
  });

  describe('3. Quota Exhaustion Read-Only & Deterministic Grading Preservation (BR-04)', () => {
    it('enforces 429 DAILY_QUOTA_EXCEEDED on AI-generating endpoints while preserving read-only access and deterministic grading', async () => {
      const user = await setupTestUser('Quota Tester', 'quota_tester@example.com');

      // Step 1: Create an active session and prepare an in-progress Practice batch
      const mockGenerateContent = vi.fn();
      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(mockExplainInitPayload),
      });

      const sessionRes = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'Operating System Deadlocks',
          initialMode: LearningMode.EXPLAIN,
        });

      expect(sessionRes.status).toBe(201);
      const sessionId = sessionRes.body.data.id as string;

      // Generate Easy batch before quota exhaustion
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(mockPracticeGeneratePayload),
      });

      const genRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.EASY });

      expect(genRes.status).toBe(200);

      // Step 2: Artificially exhaust user quota to DAILY_AI_QUOTA_LIMIT (50/50) with an active window
      const futureReset = new Date(Date.now() + 12 * 60 * 60 * 1000);
      await User.findByIdAndUpdate(user.userId, {
        $set: {
          'usageQuota.dailyCount': DAILY_AI_QUOTA_LIMIT,
          'usageQuota.windowResetAt': futureReset,
        },
      });

      // Step 3: Verify all AI-generating endpoints reject with 429 DAILY_QUOTA_EXCEEDED and include resetAt details
      // 3.1: POST /api/v1/sessions (create session)
      const rejectCreate = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          topicQuery: 'New Unreachable Topic',
          initialMode: LearningMode.EXPLAIN,
        });
      expect(rejectCreate.status).toBe(429);
      expect(rejectCreate.body.error.code).toBe(ErrorCode.DAILY_QUOTA_EXCEEDED);
      expect(rejectCreate.body.error.details.resetAt).toBeDefined();

      // 3.2: POST /api/v1/sessions/:id/explain/init
      const rejectExplainInit = await request(app)
        .post(`/api/v1/sessions/${sessionId}/explain/init`)
        .set('Authorization', `Bearer ${user.token}`);
      expect(rejectExplainInit.status).toBe(429);
      expect(rejectExplainInit.body.error.code).toBe(ErrorCode.DAILY_QUOTA_EXCEEDED);

      // 3.3: POST /api/v1/sessions/:id/explain/deeper
      const rejectExplainDeeper = await request(app)
        .post(`/api/v1/sessions/${sessionId}/explain/deeper`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepNumber: 1 });
      expect(rejectExplainDeeper.status).toBe(429);
      expect(rejectExplainDeeper.body.error.code).toBe(ErrorCode.DAILY_QUOTA_EXCEEDED);

      // 3.4: POST /api/v1/sessions/:id/interact/init
      const rejectInteractInit = await request(app)
        .post(`/api/v1/sessions/${sessionId}/interact/init`)
        .set('Authorization', `Bearer ${user.token}`);
      expect(rejectInteractInit.status).toBe(429);
      expect(rejectInteractInit.body.error.code).toBe(ErrorCode.DAILY_QUOTA_EXCEEDED);

      // 3.5: POST /api/v1/sessions/:id/interact/stream
      const rejectInteractStream = await request(app)
        .post(`/api/v1/sessions/${sessionId}/interact/stream`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ message: 'Can you give me a hint?' });
      expect(rejectInteractStream.status).toBe(429);
      expect(rejectInteractStream.body.error.code).toBe(ErrorCode.DAILY_QUOTA_EXCEEDED);

      // 3.6: POST /api/v1/sessions/:id/practice/generate
      const rejectPracticeGen = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/generate`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ tier: PracticeTier.EASY });
      expect(rejectPracticeGen.status).toBe(429);
      expect(rejectPracticeGen.body.error.code).toBe(ErrorCode.DAILY_QUOTA_EXCEEDED);

      // Step 4: Verify read-only and deterministic routes remain 100% accessible at 50/50 quota (BR-04)
      // 4.1: List sessions (GET /api/v1/sessions)
      const listRes = await request(app)
        .get('/api/v1/sessions')
        .set('Authorization', `Bearer ${user.token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

      // 4.2: Get saved session (GET /api/v1/sessions/:id)
      const getSessionRes = await request(app)
        .get(`/api/v1/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${user.token}`);
      expect(getSessionRes.status).toBe(200);
      expect(getSessionRes.body.success).toBe(true);

      // 4.3: Switch mode tabs (PATCH /api/v1/sessions/:id/mode)
      const switchRes = await request(app)
        .patch(`/api/v1/sessions/${sessionId}/mode`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ mode: LearningMode.PRACTICE });
      expect(switchRes.status).toBe(200);
      expect(switchRes.body.data.lastActiveMode).toBe(LearningMode.PRACTICE);

      // 4.4: Advance Explain cards (PATCH /api/v1/sessions/:id/explain/step)
      const stepRes = await request(app)
        .patch(`/api/v1/sessions/${sessionId}/explain/step`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ stepIndex: 3 });
      expect(stepRes.status).toBe(200);
      expect(stepRes.body.data.explainState.currentStepIndex).toBe(3);

      // 4.5: Deterministic Practice Submission (POST /api/v1/sessions/:id/practice/submit)
      // Submit all 10 answers for the already-generated in-progress Easy batch
      const userAnswers = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const submitRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/practice/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          tier: PracticeTier.EASY,
          answers: userAnswers,
        });

      expect(submitRes.status).toBe(200);
      expect(submitRes.body.success).toBe(true);

      const submittedEasy = submitRes.body.data.practiceState.batches.easy;
      expect(submittedEasy.status).toBe(BatchStatus.COMPLETED);
      expect(submittedEasy.score).toBe(10); // All 10 answers match correctOptionIndex: 0
      expect(submittedEasy.userAnswers).toEqual(userAnswers);

      // Verify unmasked answers & explanations revealed
      submittedEasy.questions.forEach((q: { correctOptionIndex: number; solutionExplanation: string }) => {
        expect(q.correctOptionIndex).toBe(0);
        expect(q.solutionExplanation).toContain('REASONING:');
      });

      // Verify Medium unlocked to 'not_started' per BR-02
      expect(submitRes.body.data.practiceState.batches.medium.status).toBe(BatchStatus.NOT_STARTED);

      // Verify daily quota remained strictly at 50 without being incremented
      const dbUser = await User.findById(user.userId);
      expect(dbUser?.usageQuota.dailyCount).toBe(50);
    });
  });
});

