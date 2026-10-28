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
  SocraticOutcome,
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
import {
  computeNextInteractState,
  ControlHeaderStreamParser,
} from '../services/interact.service.js';

describe('IMP-019: Backend Interact Mode Service, 3-Strike State Machine, & Unbuffered SSE Controller', () => {
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
        preferredStyle: ExplanationStyle.CONCISE_TECHNICAL,
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
    topicQuery = 'Distributed Consensus in Raft'
  ) => {
    return sessionRepository.create({
      userId,
      topicQuery,
      normalizedTitle: topicQuery,
      initialMode: LearningMode.INTERACT,
    });
  };

  const mockInteractInitPayload = {
    isEducationalValid: true,
    normalizedTitle: 'Raft Consensus Algorithm',
    milestones: [
      {
        milestoneNumber: 1,
        title: 'Leader Election Protocol',
        description: 'Understand split votes, randomized election timeouts, and majority quorum.',
      },
      {
        milestoneNumber: 2,
        title: 'Log Replication & Matching',
        description: 'Understand monotonic index growth and entry commit safety invariants.',
      },
      {
        milestoneNumber: 3,
        title: 'Safety Invariants & Leader Completeness',
        description: 'Understand why a candidate must have all committed entries to become leader.',
      },
    ],
    openingQuestion:
      'What problem arises when two candidate nodes start elections simultaneously in the same term, and how does Raft solve it?',
  };

  describe('1. Pure 3-Strike Socratic State Machine (computeNextInteractState)', () => {
    const baseMilestones = [
      {
        milestoneNumber: 1,
        title: 'Milestone 1',
        description: 'Desc 1',
        status: MilestoneStatus.ACTIVE,
      },
      {
        milestoneNumber: 2,
        title: 'Milestone 2',
        description: 'Desc 2',
        status: MilestoneStatus.PENDING,
      },
      {
        milestoneNumber: 3,
        title: 'Milestone 3',
        description: 'Desc 3',
        status: MilestoneStatus.PENDING,
      },
    ];

    it('transitions strikeCount 0 -> 1 on first incorrect turn (Strike 1 Nudge)', () => {
      const result = computeNextInteractState({
        milestones: baseMilestones,
        activeMilestoneIndex: 0,
        strikeCount: 0,
        outcome: SocraticOutcome.STRIKE,
        forceDirectExplanation: false,
      });

      expect(result.nextStrikeCount).toBe(1);
      expect(result.strikeNumberAtTurn).toBe(1);
      expect(result.isCircuitBreakerExplanation).toBe(false);
      expect(result.nextMilestoneIndex).toBe(0);
      expect(result.nextStatus).toBe(InteractStatus.ACTIVE);
    });

    it('transitions strikeCount 1 -> 2 on second incorrect turn (Strike 2 Hint)', () => {
      const result = computeNextInteractState({
        milestones: baseMilestones,
        activeMilestoneIndex: 0,
        strikeCount: 1,
        outcome: SocraticOutcome.STRIKE,
        forceDirectExplanation: false,
      });

      expect(result.nextStrikeCount).toBe(2);
      expect(result.strikeNumberAtTurn).toBe(2);
      expect(result.isCircuitBreakerExplanation).toBe(false);
      expect(result.nextMilestoneIndex).toBe(0);
    });

    it('triggers Circuit Breaker on third strike (strikeCount 2 -> resets to 0)', () => {
      const result = computeNextInteractState({
        milestones: baseMilestones,
        activeMilestoneIndex: 0,
        strikeCount: 2,
        outcome: SocraticOutcome.STRIKE,
        forceDirectExplanation: false,
      });

      expect(result.nextStrikeCount).toBe(0); // Resets to 0!
      expect(result.strikeNumberAtTurn).toBe(3);
      expect(result.isCircuitBreakerExplanation).toBe(true);
      expect(result.nextMilestoneIndex).toBe(0);
      expect(result.nextStatus).toBe(InteractStatus.ACTIVE);
    });

    it('triggers Circuit Breaker and resets strikeCount to 0 when forceDirectExplanation is true (FR-013)', () => {
      const result = computeNextInteractState({
        milestones: baseMilestones,
        activeMilestoneIndex: 0,
        strikeCount: 1,
        outcome: SocraticOutcome.STRIKE,
        forceDirectExplanation: true,
      });

      expect(result.nextStrikeCount).toBe(0); // Resets to 0!
      expect(result.isCircuitBreakerExplanation).toBe(true);
      expect(result.nextMilestoneIndex).toBe(0);
    });

    it('advances to next milestone and resets strikeCount when outcome is ADVANCE', () => {
      const result = computeNextInteractState({
        milestones: baseMilestones,
        activeMilestoneIndex: 0,
        strikeCount: 1,
        outcome: SocraticOutcome.ADVANCE,
        forceDirectExplanation: false,
      });

      expect(result.nextMilestoneIndex).toBe(1);
      expect(result.nextStrikeCount).toBe(0);
      expect(result.isCircuitBreakerExplanation).toBe(false);
      expect(result.updatedMilestones[0]?.status).toBe(MilestoneStatus.COMPLETED);
      expect(result.updatedMilestones[1]?.status).toBe(MilestoneStatus.ACTIVE);
      expect(result.nextStatus).toBe(InteractStatus.ACTIVE);
    });

    it('sets interactState status to COMPLETED when advancing on final milestone', () => {
      const milestonesOnFinal = [
        {
          milestoneNumber: 1,
          title: 'Milestone 1',
          description: 'Desc 1',
          status: MilestoneStatus.COMPLETED,
        },
        {
          milestoneNumber: 2,
          title: 'Milestone 2',
          description: 'Desc 2',
          status: MilestoneStatus.COMPLETED,
        },
        {
          milestoneNumber: 3,
          title: 'Milestone 3',
          description: 'Desc 3',
          status: MilestoneStatus.ACTIVE,
        },
      ];

      const result = computeNextInteractState({
        milestones: milestonesOnFinal,
        activeMilestoneIndex: 2,
        strikeCount: 0,
        outcome: SocraticOutcome.ADVANCE,
        forceDirectExplanation: false,
      });

      expect(result.nextMilestoneIndex).toBe(2);
      expect(result.updatedMilestones[2]?.status).toBe(MilestoneStatus.COMPLETED);
      expect(result.nextStatus).toBe(InteractStatus.COMPLETED);
    });
  });

  describe('2. Control Header Stream Parser (ControlHeaderStreamParser)', () => {
    it('parses <<MENTORA_STATE:{"outcome":"ADVANCE"}>> and strips it cleanly from delta', () => {
      const parser = new ControlHeaderStreamParser(SocraticOutcome.STRIKE);
      const chunk1 = '<<MENTORA_STATE:{"outcome":"ADVANCE"}>>\nGreat work! ';
      const chunk2 = 'You have mastered the concept.';

      const text1 = parser.processChunk(chunk1);
      const text2 = parser.processChunk(chunk2);

      expect(text1).toBe('Great work! ');
      expect(text2).toBe('You have mastered the concept.');
      expect(parser.getOutcome()).toBe(SocraticOutcome.ADVANCE);
    });

    it('handles header split across multiple small chunk boundaries', () => {
      const parser = new ControlHeaderStreamParser(SocraticOutcome.STRIKE);

      expect(parser.processChunk('<<MENTORA_')).toBe('');
      expect(parser.processChunk('STATE:{"outcome"')).toBe('');
      expect(parser.processChunk(':"CIRCUIT_BREAKER_ACK"}>>\nHere is the ')).toBe('Here is the ');
      expect(parser.processChunk('explanation.')).toBe('explanation.');
      expect(parser.getOutcome()).toBe(SocraticOutcome.CIRCUIT_BREAKER_ACK);
    });

    it('falls back safely without losing text if model omits control header', () => {
      const parser = new ControlHeaderStreamParser(SocraticOutcome.STRIKE);
      const chunk1 = 'Let us explore this question by considering what the leader does...';

      // Longer than 200 chars or flushed at end
      const chunk2 =
        ' This is a very detailed explanation that continues for quite some length to exceed the safety buffer threshold.';

      const text1 = parser.processChunk(chunk1);
      const text2 = parser.processChunk(chunk2);
      const flushed = parser.flush();

      const total = text1 + text2 + flushed;
      expect(total).toContain('Let us explore this question');
      expect(parser.getOutcome()).toBe(SocraticOutcome.STRIKE);
    });
  });

  describe('3. Interact Mode Milestone Initialization Endpoint (/interact/init, AC-INT-01)', () => {
    it('initializes 3-5 milestones, opening question, sets status = active, strikeCount = 0, and increments quota', async () => {
      const user = await setupUser('Barbara Liskov', 'liskov@example.com');
      const session = await createTestSession(user.userId);

      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify(mockInteractInitPayload),
      });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/init`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);

      const data = res.body.data;
      expect(data.normalizedTitle).toBe('Raft Consensus Algorithm');
      expect(data.interactState.status).toBe(InteractStatus.ACTIVE);
      expect(data.interactState.activeMilestoneIndex).toBe(0);
      expect(data.interactState.strikeCount).toBe(0);
      expect(data.interactState.milestones).toHaveLength(3);
      expect(data.interactState.milestones[0].status).toBe(MilestoneStatus.ACTIVE);
      expect(data.interactState.milestones[1].status).toBe(MilestoneStatus.PENDING);
      expect(data.interactState.messages).toHaveLength(1);
      expect(data.interactState.messages[0].role).toBe('assistant');
      expect(data.interactState.messages[0].content).toContain('elections simultaneously');

      // User quota was incremented to 1
      expect(res.body.meta.quota.used).toBe(1);
      const dbUser = await User.findById(user.userId);
      expect(dbUser?.usageQuota.dailyCount).toBe(1);
    });

    it('is idempotent: repeat call returns existing state without incrementing quota or calling Gemini', async () => {
      const user = await setupUser('Leslie Lamport', 'lamport@example.com');
      const session = await createTestSession(user.userId);

      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify(mockInteractInitPayload),
      });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      // First call
      await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/init`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);

      // Second call (idempotent)
      const res2 = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/init`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(res2.status).toBe(200);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1); // Not called again!

      const dbUser = await User.findById(user.userId);
      expect(dbUser?.usageQuota.dailyCount).toBe(1); // Still 1!
    });
  });

  describe('4. Socratic Streaming Turn & SSE Protocol (/interact/stream, AC-INT-02, AC-INT-03)', () => {
    it('sets unbuffered SSE headers and streams tokens, stripping <<MENTORA_STATE>> tag', async () => {
      const user = await setupUser('Edsger Dijkstra', 'dijkstra@example.com');
      const session = await createTestSession(user.userId);

      // Initialize session first
      setGeminiClient({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: JSON.stringify(mockInteractInitPayload),
          }),
        },
      } as unknown as GoogleGenAI);

      await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/init`)
        .set('Authorization', `Bearer ${user.token}`);

      // Mock streaming turn
      const mockGenerateContentStream = vi.fn().mockImplementation(async function* () {
        yield { text: '<<MENTORA_STATE:{"outcome":"STRIKE"}>>\n' };
        yield { text: 'That is partially correct. ' };
        yield { text: 'Think about what happens to the election timeout.' };
      });

      setGeminiClient({
        models: {
          generateContent: vi.fn(),
          generateContentStream: mockGenerateContentStream,
        },
      } as unknown as GoogleGenAI);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/stream`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          message: 'Both nodes vote for themselves and split the vote.',
        });

      expect(res.status).toBe(200);

      // Check mandatory unbuffered SSE headers (architecture.md Section G.3 & H.2, AGENTS.md Section M)
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.headers['cache-control']).toBe('no-cache, no-transform');
      expect(res.headers['connection']).toBe('keep-alive');
      expect(res.headers['x-accel-buffering']).toBe('no');

      const responseText = res.text;
      // Header must NOT leak into client stream (AC-INT-02, IMP-019 AC 4)
      expect(responseText).not.toContain('<<MENTORA_STATE');
      expect(responseText).toContain('event: start');
      expect(responseText).toContain('event: token');
      expect(responseText).toContain('event: metadata');
      expect(responseText).toContain('event: done');
      expect(responseText).toContain('That is partially correct.');

      // Check MongoDB state: strikeCount transitioned to 1 (Strike 1 Nudge)
      const dbSession = await TopicSession.findById(session._id);
      expect(dbSession?.interactState.strikeCount).toBe(1);
      expect(dbSession?.interactState.messages).toHaveLength(3); // 1 opening + 1 user + 1 assistant

      const assistantMsg = dbSession?.interactState.messages[2];
      expect(assistantMsg?.role).toBe('assistant');
      expect(assistantMsg?.strikeNumberAtTurn).toBe(1);
      expect(assistantMsg?.isCircuitBreakerExplanation).toBe(false);
      expect(assistantMsg?.content).not.toContain('<<MENTORA_STATE');
      expect(assistantMsg?.content).toContain('That is partially correct.');
    });

    it('progresses through 3 consecutive strikes and resets strikeCount to 0 via Circuit Breaker (AC-INT-02)', async () => {
      const user = await setupUser('Grace Hopper', 'hopper@example.com');
      const session = await createTestSession(user.userId);

      // 1. Init
      setGeminiClient({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: JSON.stringify(mockInteractInitPayload),
          }),
        },
      } as unknown as GoogleGenAI);

      await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/init`)
        .set('Authorization', `Bearer ${user.token}`);

      // Turn 1 -> Strike 1
      setGeminiClient({
        models: {
          generateContentStream: vi.fn().mockImplementation(async function* () {
            yield { text: '<<MENTORA_STATE:{"outcome":"STRIKE"}>>\nStrike 1 Nudge explanation.' };
          }),
        },
      } as unknown as GoogleGenAI);

      await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/stream`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ message: 'I do not know.' });

      let dbSession = await TopicSession.findById(session._id);
      expect(dbSession?.interactState.strikeCount).toBe(1);

      // Turn 2 -> Strike 2
      setGeminiClient({
        models: {
          generateContentStream: vi.fn().mockImplementation(async function* () {
            yield { text: '<<MENTORA_STATE:{"outcome":"STRIKE"}>>\nStrike 2 Hint explanation.' };
          }),
        },
      } as unknown as GoogleGenAI);

      await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/stream`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ message: 'Still unsure.' });

      dbSession = await TopicSession.findById(session._id);
      expect(dbSession?.interactState.strikeCount).toBe(2);

      // Turn 3 -> Strike 3 (Circuit Breaker!)
      setGeminiClient({
        models: {
          generateContentStream: vi.fn().mockImplementation(async function* () {
            yield {
              text: '<<MENTORA_STATE:{"outcome":"STRIKE"}>>\nDirect explanation: Raft uses randomized election timeouts so one node times out first.',
            };
          }),
        },
      } as unknown as GoogleGenAI);

      await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/stream`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ message: 'Can you tell me?' });

      dbSession = await TopicSession.findById(session._id);
      // Circuit Breaker triggered: strikeCount resets to 0!
      expect(dbSession?.interactState.strikeCount).toBe(0);

      const lastAssistantMsg = dbSession?.interactState.messages[6];
      expect(lastAssistantMsg?.isCircuitBreakerExplanation).toBe(true);
      expect(lastAssistantMsg?.strikeNumberAtTurn).toBe(3);
    });

    it('advances milestone and resets strikeCount to 0 when outcome is ADVANCE (AC-INT-03)', async () => {
      const user = await setupUser('Claude Shannon', 'shannon@example.com');
      const session = await createTestSession(user.userId);

      setGeminiClient({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: JSON.stringify(mockInteractInitPayload),
          }),
        },
      } as unknown as GoogleGenAI);

      await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/init`)
        .set('Authorization', `Bearer ${user.token}`);

      // First set strikeCount to 1
      await TopicSession.findByIdAndUpdate(session._id, {
        $set: { 'interactState.strikeCount': 1 },
      });

      // Stream turn with outcome ADVANCE
      setGeminiClient({
        models: {
          generateContentStream: vi.fn().mockImplementation(async function* () {
            yield {
              text: '<<MENTORA_STATE:{"outcome":"ADVANCE"}>>\nSpot on! Randomized timeouts prevent split vote livelocks.',
            };
          }),
        },
      } as unknown as GoogleGenAI);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/stream`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          message:
            'Randomized election timeouts ensure one follower times out before the other and wins majority vote.',
        });

      expect(res.status).toBe(200);

      const dbSession = await TopicSession.findById(session._id);
      expect(dbSession?.interactState.activeMilestoneIndex).toBe(1); // Advanced to Milestone 2!
      expect(dbSession?.interactState.strikeCount).toBe(0); // Reset to 0!
      expect(dbSession?.interactState.milestones[0]?.status).toBe(MilestoneStatus.COMPLETED);
      expect(dbSession?.interactState.milestones[1]?.status).toBe(MilestoneStatus.ACTIVE);
      expect(dbSession?.interactState.status).toBe(InteractStatus.ACTIVE);
    });

    it('immediately triggers Circuit Breaker when forceDirectExplanation is true (FR-013)', async () => {
      const user = await setupUser('Margaret Hamilton', 'hamilton@example.com');
      const session = await createTestSession(user.userId);

      setGeminiClient({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: JSON.stringify(mockInteractInitPayload),
          }),
        },
      } as unknown as GoogleGenAI);

      await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/init`)
        .set('Authorization', `Bearer ${user.token}`);

      // Set strikeCount to 1
      await TopicSession.findByIdAndUpdate(session._id, {
        $set: { 'interactState.strikeCount': 1 },
      });

      setGeminiClient({
        models: {
          generateContentStream: vi.fn().mockImplementation(async function* () {
            yield {
              text: '<<MENTORA_STATE:{"outcome":"CIRCUIT_BREAKER_ACK"}>>\nHere is the direct explanation of leader election...',
            };
          }),
        },
      } as unknown as GoogleGenAI);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/stream`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          message: 'I am completely stuck. Please explain this concept directly.',
          forceDirectExplanation: true,
        });

      expect(res.status).toBe(200);

      const dbSession = await TopicSession.findById(session._id);
      expect(dbSession?.interactState.strikeCount).toBe(0); // Reset to 0!
      expect(dbSession?.interactState.activeMilestoneIndex).toBe(0); // Stays on active milestone

      const lastMsg = dbSession?.interactState.messages[2];
      expect(lastMsg?.isCircuitBreakerExplanation).toBe(true);
    });

    it('recovers cleanly on mid-stream failure without mutating MongoDB or incrementing quota (Edge Case 4)', async () => {
      const user = await setupUser('John von Neumann', 'neumann@example.com');
      const session = await createTestSession(user.userId);

      setGeminiClient({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: JSON.stringify(mockInteractInitPayload),
          }),
        },
      } as unknown as GoogleGenAI);

      await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/init`)
        .set('Authorization', `Bearer ${user.token}`);

      // Mock stream that fails mid-flight
      setGeminiClient({
        models: {
          generateContentStream: vi.fn().mockImplementation(async function* () {
            yield { text: '<<MENTORA_STATE:{"outcome":"STRIKE"}>>\nStarting...' };
            throw new Error('Gemini API connection reset');
          }),
        },
      } as unknown as GoogleGenAI);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/stream`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ message: 'Hello' });

      // Emitted event: error
      expect(res.text).toContain('event: error');
      expect(res.text).toContain('AI_UPSTREAM_FAILURE');

      // Database state remains unchanged (still 1 opening message, strikeCount 0, quota = 1)
      const dbSession = await TopicSession.findById(session._id);
      expect(dbSession?.interactState.messages).toHaveLength(1);
      expect(dbSession?.interactState.strikeCount).toBe(0);

      const dbUser = await User.findById(user.userId);
      expect(dbUser?.usageQuota.dailyCount).toBe(1);
    });
  });

  describe('5. Security, Guards, & Isolation (BR-01, BR-04, NFR-005)', () => {
    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const res = await request(app).post('/api/v1/sessions/session-id/interact/init');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('blocks access with 403 PROFILE_INCOMPLETE if learner profile is incomplete', async () => {
      const incompleteUser = await setupUser('Incomplete', 'incomplete@example.com', false);
      const res = await request(app)
        .post('/api/v1/sessions/507f1f77bcf86cd799439011/interact/init')
        .set('Authorization', `Bearer ${incompleteUser.token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.PROFILE_INCOMPLETE);
    });

    it('returns 404 RESOURCE_NOT_FOUND when user attempts to access another user session', async () => {
      const user1 = await setupUser('User 1', 'user1@example.com');
      const user2 = await setupUser('User 2', 'user2@example.com');
      const session1 = await createTestSession(user1.userId);

      const resInit = await request(app)
        .post(`/api/v1/sessions/${session1._id.toString()}/interact/init`)
        .set('Authorization', `Bearer ${user2.token}`);
      expect(resInit.status).toBe(404);
      expect(resInit.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);

      const resStream = await request(app)
        .post(`/api/v1/sessions/${session1._id.toString()}/interact/stream`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ message: 'Hello' });
      expect(resStream.status).toBe(404);
      expect(resStream.body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
    });

    it('returns 400 VALIDATION_ERROR when /stream is called before /init', async () => {
      const user = await setupUser('User', 'user@example.com');
      const session = await createTestSession(user.userId);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/stream`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ message: 'Hello' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('returns 422 EDUCATIONAL_GUARDRAIL_REFUSAL when model rejects topic during /init', async () => {
      const user = await setupUser('User Refusal', 'refusal@example.com');
      const session = await createTestSession(user.userId, 'How to make explosives');

      setGeminiClient({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: JSON.stringify({
              isEducationalValid: false,
              refusalReason:
                'Weapons and explosives manufacturing is strictly prohibited and outside educational scope.',
            }),
          }),
        },
      } as unknown as GoogleGenAI);

      const res = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/init`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.EDUCATIONAL_GUARDRAIL_REFUSAL);

      // Session in MongoDB remains not_started
      const dbSession = await TopicSession.findById(session._id);
      expect(dbSession?.interactState.status).toBe(InteractStatus.NOT_STARTED);
    });

    it('blocks /init and /stream with 429 DAILY_QUOTA_EXCEEDED when daily quota is exhausted', async () => {
      const user = await setupUser('Quota User', 'quota@example.com', true, 50);
      const session = await createTestSession(user.userId);

      const resInit = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/init`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(resInit.status).toBe(429);
      expect(resInit.body.error.code).toBe(ErrorCode.DAILY_QUOTA_EXCEEDED);

      const resStream = await request(app)
        .post(`/api/v1/sessions/${session._id.toString()}/interact/stream`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ message: 'Hello' });

      expect(resStream.status).toBe(429);
      expect(resStream.body.error.code).toBe(ErrorCode.DAILY_QUOTA_EXCEEDED);
    });
  });
});
