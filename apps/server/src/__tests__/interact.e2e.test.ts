import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { GoogleGenAI } from '@google/genai';
import {
  EducationLevel,
  ExplanationStyle,
  LearningMode,
  InteractStatus,
  MilestoneStatus,
  ErrorCode,
} from '@mentora/shared';
import { app } from '../app.js';
import { User } from '../models/User.model.js';
import { TopicSession } from '../models/TopicSession.model.js';
import {
  setGeminiClient,
  resetGeminiClient,
} from '../ai/gemini.client.js';

describe('IMP-021: Backend End-to-End Interact Mode Lifecycle & 3-Strike Circuit Breaker Verification', () => {
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
    preferredStyle = ExplanationStyle.CONCISE_TECHNICAL
  ) => {
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

  const mockInteractInitPayload = {
    isEducationalValid: true,
    normalizedTitle: 'Raft Consensus Protocol',
    milestones: [
      {
        milestoneNumber: 1,
        title: 'Leader Election & Heartbeats',
        description: 'Understand terms, candidate transitions, and split-vote resolution.',
      },
      {
        milestoneNumber: 2,
        title: 'Log Replication & Matching Invariant',
        description: 'Understand AppendEntries RPC, log indices, and entry commitment.',
      },
      {
        milestoneNumber: 3,
        title: 'Safety Invariants & Leader Completeness',
        description: 'Understand why a candidate must have all committed entries to win an election.',
      },
    ],
    openingQuestion:
      'In Raft, what mechanism prevents two candidate nodes from repeatedly splitting votes in an election?',
  };

  it('verifies the full Socratic journey: init -> 3 strikes with Circuit Breaker -> manual escape hatch -> milestone advance -> session restoration', async () => {
    const user = await registerAndProfileUser('Barbara Liskov', 'liskov@example.com');

    // 1. Create a session in Interact Mode
    const createSessionRes = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        topicQuery: 'Distributed Consensus in Raft',
        initialMode: LearningMode.INTERACT,
        autoInitialize: false,
      });

    expect(createSessionRes.status).toBe(201);
    const sessionId = createSessionRes.body.data.id as string;

    // 2. Initialize Interact Mode (POST /api/v1/sessions/:id/interact/init)
    setGeminiClient({
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify(mockInteractInitPayload),
        }),
      },
    } as unknown as GoogleGenAI);

    const initRes = await request(app)
      .post(`/api/v1/sessions/${sessionId}/interact/init`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(initRes.status).toBe(200);
    expect(initRes.body.success).toBe(true);
    expect(initRes.body.meta.quota.used).toBe(1);

    const initData = initRes.body.data;
    expect(initData.interactState.status).toBe(InteractStatus.ACTIVE);
    expect(initData.interactState.activeMilestoneIndex).toBe(0);
    expect(initData.interactState.strikeCount).toBe(0);
    expect(initData.interactState.milestones).toHaveLength(3);
    expect(initData.interactState.milestones[0].status).toBe(MilestoneStatus.ACTIVE);
    expect(initData.interactState.milestones[1].status).toBe(MilestoneStatus.PENDING);
    expect(initData.interactState.messages).toHaveLength(1);
    expect(initData.interactState.messages[0].role).toBe('assistant');
    expect(initData.interactState.messages[0].content).toContain('splitting votes');

    // 3. Turn 1: Struggle Response -> Strike 1 (Socratic Nudge)
    setGeminiClient({
      models: {
        generateContent: vi.fn(),
        generateContentStream: vi.fn().mockImplementation(async function* () {
          yield { text: '<<MENTORA_STATE:{"outcome":"STRIKE"}>>\n' };
          yield { text: 'Not quite. Think about how timers differ between nodes.' };
        }),
      },
    } as unknown as GoogleGenAI);

    const turn1Res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/interact/stream`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ message: 'They both wait on a fixed 1-second timeout.' });

    expect(turn1Res.status).toBe(200);
    expect(turn1Res.headers['content-type']).toContain('text/event-stream');
    expect(turn1Res.headers['x-accel-buffering']).toBe('no');
    expect(turn1Res.text).not.toContain('<<MENTORA_STATE');
    expect(turn1Res.text).toContain('Think about how timers differ between nodes.');
    expect(turn1Res.text).toContain('"strikeCount":1');

    // Verify MongoDB state after Turn 1
    let sessionInDb = await TopicSession.findById(sessionId);
    expect(sessionInDb?.interactState.strikeCount).toBe(1);
    expect(sessionInDb?.interactState.messages).toHaveLength(3); // 1 opening + 1 user + 1 assistant
    expect(sessionInDb?.interactState.messages[2]?.strikeNumberAtTurn).toBe(1);
    expect(sessionInDb?.interactState.messages[2]?.isCircuitBreakerExplanation).toBe(false);

    // 4. Turn 2: Struggle Response -> Strike 2 (Concrete Hint)
    setGeminiClient({
      models: {
        generateContent: vi.fn(),
        generateContentStream: vi.fn().mockImplementation(async function* () {
          yield { text: '<<MENTORA_STATE:{"outcome":"STRIKE"}>>\n' };
          yield { text: 'Here is a hint: Raft chooses election timeouts randomly from an interval like 150-300ms.' };
        }),
      },
    } as unknown as GoogleGenAI);

    const turn2Res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/interact/stream`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ message: 'A central clock tells them when to step down.' });

    expect(turn2Res.status).toBe(200);
    expect(turn2Res.text).toContain('"strikeCount":2');

    sessionInDb = await TopicSession.findById(sessionId);
    expect(sessionInDb?.interactState.strikeCount).toBe(2);
    expect(sessionInDb?.interactState.messages).toHaveLength(5);
    expect(sessionInDb?.interactState.messages[4]?.strikeNumberAtTurn).toBe(2);

    // 5. Turn 3: Struggle Response -> Strike 3 (Circuit Breaker Explanation & Reset to 0)
    setGeminiClient({
      models: {
        generateContent: vi.fn(),
        generateContentStream: vi.fn().mockImplementation(async function* () {
          yield { text: '<<MENTORA_STATE:{"outcome":"STRIKE"}>>\n' };
          yield { text: 'Direct Explanation: Raft uses randomized election timeouts. Because each node picks a random timeout between 150ms and 300ms, one candidate will almost always time out before others, request votes, and win a majority before any other candidate split occurs.' };
        }),
      },
    } as unknown as GoogleGenAI);

    const turn3Res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/interact/stream`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ message: 'I give up, tell me the answer.' });

    expect(turn3Res.status).toBe(200);
    expect(turn3Res.text).toContain('"strikeCount":0');
    expect(turn3Res.text).toContain('Direct Explanation: Raft uses randomized election timeouts.');

    sessionInDb = await TopicSession.findById(sessionId);
    expect(sessionInDb?.interactState.strikeCount).toBe(0);
    expect(sessionInDb?.interactState.activeMilestoneIndex).toBe(0);
    expect(sessionInDb?.interactState.messages).toHaveLength(7);
    const cbMsg = sessionInDb?.interactState.messages[6];
    expect(cbMsg?.isCircuitBreakerExplanation).toBe(true);

    // 6. Turn 4: Manual Escape Hatch (forceDirectExplanation: true, FR-013)
    setGeminiClient({
      models: {
        generateContent: vi.fn(),
        generateContentStream: vi.fn().mockImplementation(async function* () {
          yield { text: '<<MENTORA_STATE:{"outcome":"CIRCUIT_BREAKER_ACK"}>>\n' };
          yield { text: 'Direct milestone review provided upon your request.' };
        }),
      },
    } as unknown as GoogleGenAI);

    const turn4Res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/interact/stream`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        message: 'Please explain this milestone directly.',
        forceDirectExplanation: true,
      });

    expect(turn4Res.status).toBe(200);
    expect(turn4Res.text).toContain('"strikeCount":0');

    sessionInDb = await TopicSession.findById(sessionId);
    expect(sessionInDb?.interactState.messages[8]?.isCircuitBreakerExplanation).toBe(true);

    // 7. Turn 5: Milestone Mastery Advance (outcome: "ADVANCE", AC-INT-03)
    setGeminiClient({
      models: {
        generateContent: vi.fn(),
        generateContentStream: vi.fn().mockImplementation(async function* () {
          yield { text: '<<MENTORA_STATE:{"outcome":"ADVANCE"}>>\n' };
          yield { text: 'Excellent! You have mastered Leader Election. Next, let us examine Log Replication.' };
        }),
      },
    } as unknown as GoogleGenAI);

    const turn5Res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/interact/stream`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        message: 'Randomized election timeouts break split vote symmetry so one node times out first and collects majority votes.',
      });

    expect(turn5Res.status).toBe(200);
    expect(turn5Res.text).toContain('"activeMilestoneIndex":1');
    expect(turn5Res.text).toContain('"strikeCount":0');

    sessionInDb = await TopicSession.findById(sessionId);
    expect(sessionInDb?.interactState.activeMilestoneIndex).toBe(1);
    expect(sessionInDb?.interactState.milestones[0]?.status).toBe(MilestoneStatus.COMPLETED);
    expect(sessionInDb?.interactState.milestones[1]?.status).toBe(MilestoneStatus.ACTIVE);
    expect(sessionInDb?.interactState.milestones[2]?.status).toBe(MilestoneStatus.PENDING);

    // 8. Session Restoration Verification (GET /api/v1/sessions/:id, FR-006)
    const restoreRes = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(restoreRes.status).toBe(200);
    const restoredSession = restoreRes.body.data;
    expect(restoredSession.id).toBe(sessionId);
    expect(restoredSession.interactState.status).toBe(InteractStatus.ACTIVE);
    expect(restoredSession.interactState.activeMilestoneIndex).toBe(1);
    expect(restoredSession.interactState.strikeCount).toBe(0);
    expect(restoredSession.interactState.milestones[0].status).toBe(MilestoneStatus.COMPLETED);
    expect(restoredSession.interactState.milestones[1].status).toBe(MilestoneStatus.ACTIVE);
    expect(restoredSession.interactState.messages).toHaveLength(11);
  });

  it('marks entire interact session as completed when advancing past the final milestone', async () => {
    const user = await registerAndProfileUser('Grace Hopper', 'grace@example.com');

    // Create session directly on final milestone (index 2 of 3)
    const session = await TopicSession.create({
      userId: new mongoose.Types.ObjectId(user.userId),
      topicQuery: 'Distributed Consensus in Raft',
      normalizedTitle: 'Raft Consensus Protocol',
      lastActiveMode: LearningMode.INTERACT,
      interactState: {
        status: InteractStatus.ACTIVE,
        activeMilestoneIndex: 2,
        strikeCount: 0,
        milestones: [
          {
            milestoneNumber: 1,
            title: 'M1',
            description: 'D1',
            status: MilestoneStatus.COMPLETED,
          },
          {
            milestoneNumber: 2,
            title: 'M2',
            description: 'D2',
            status: MilestoneStatus.COMPLETED,
          },
          {
            milestoneNumber: 3,
            title: 'M3',
            description: 'D3',
            status: MilestoneStatus.ACTIVE,
          },
        ],
        messages: [
          {
            id: 'init-msg',
            role: 'assistant',
            content: 'Final question on Leader Completeness.',
            milestoneNumber: 3,
            strikeNumberAtTurn: 0,
            isCircuitBreakerExplanation: false,
            createdAt: new Date().toISOString(),
          },
        ],
      },
    });

    setGeminiClient({
      models: {
        generateContent: vi.fn(),
        generateContentStream: vi.fn().mockImplementation(async function* () {
          yield { text: '<<MENTORA_STATE:{"outcome":"ADVANCE"}>>\n' };
          yield { text: 'Outstanding! You have completed all milestones for Raft Consensus.' };
        }),
      },
    } as unknown as GoogleGenAI);

    const streamRes = await request(app)
      .post(`/api/v1/sessions/${session._id.toString()}/interact/stream`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        message: 'A candidate node must have all committed entries to win an election because voters deny votes if their log is more up-to-date.',
      });

    expect(streamRes.status).toBe(200);
    expect(streamRes.text).toContain('"isCompleted":true');

    const dbSession = await TopicSession.findById(session._id);
    expect(dbSession?.interactState.status).toBe(InteractStatus.COMPLETED);
    expect(dbSession?.interactState.milestones[2]?.status).toBe(MilestoneStatus.COMPLETED);
  });

  it('enforces multi-tenant isolation: foreign users receive 404 RESOURCE_NOT_FOUND (NFR-005)', async () => {
    const userA = await registerAndProfileUser('Alice Node', 'alice@example.com');
    const userB = await registerAndProfileUser('Bob Node', 'bob@example.com');

    // Create session owned by User A
    const sessionRes = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        topicQuery: 'Private Session by Alice',
        initialMode: LearningMode.INTERACT,
        autoInitialize: false,
      });

    const sessionId = sessionRes.body.data.id as string;

    // User B attempts to initialize User A's session -> 404
    const foreignInitRes = await request(app)
      .post(`/api/v1/sessions/${sessionId}/interact/init`)
      .set('Authorization', `Bearer ${userB.token}`);

    expect(foreignInitRes.status).toBe(404);
    expect(foreignInitRes.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);

    // User B attempts to stream turns into User A's session -> 404
    const foreignStreamRes = await request(app)
      .post(`/api/v1/sessions/${sessionId}/interact/stream`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ message: 'Unauthorized turn probe' });

    expect(foreignStreamRes.status).toBe(404);
    expect(foreignStreamRes.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
  });

  it('handles mid-stream upstream failure safely without corrupting MongoDB or penalizing strikes (Edge Case 4)', async () => {
    const user = await registerAndProfileUser('Fault Tolerant Node', 'ft@example.com');

    const session = await TopicSession.create({
      userId: new mongoose.Types.ObjectId(user.userId),
      topicQuery: 'Failure Recovery in Raft',
      normalizedTitle: 'Failure Recovery in Raft',
      lastActiveMode: LearningMode.INTERACT,
      interactState: {
        status: InteractStatus.ACTIVE,
        activeMilestoneIndex: 0,
        strikeCount: 1, // Already at strike 1
        milestones: [
          {
            milestoneNumber: 1,
            title: 'M1',
            description: 'D1',
            status: MilestoneStatus.ACTIVE,
          },
        ],
        messages: [
          {
            id: 'm-1',
            role: 'assistant',
            content: 'Opening question.',
            milestoneNumber: 1,
            strikeNumberAtTurn: 0,
            isCircuitBreakerExplanation: false,
            createdAt: new Date().toISOString(),
          },
        ],
      },
    });

    // Mock stream that fails mid-flight
    setGeminiClient({
      models: {
        generateContent: vi.fn(),
        generateContentStream: vi.fn().mockImplementation(async function* () {
          yield { text: '<<MENTORA_STATE:{"outcome":"STRIKE"}>>\n' };
          yield { text: 'Partial text before failure...' };
          throw new Error('Upstream socket reset');
        }),
      },
    } as unknown as GoogleGenAI);

    const streamRes = await request(app)
      .post(`/api/v1/sessions/${session._id.toString()}/interact/stream`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ message: 'My probe answer' });

    expect(streamRes.status).toBe(200);
    expect(streamRes.text).toContain('event: error');

    // Strike count in MongoDB remains strictly at 1 (no strike penalty on stream drop)
    const dbSession = await TopicSession.findById(session._id);
    expect(dbSession?.interactState.strikeCount).toBe(1);
    expect(dbSession?.interactState.messages).toHaveLength(1); // Unchanged
  });
});

