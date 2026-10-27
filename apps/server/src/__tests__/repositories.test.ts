import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  EducationLevel,
  ExplanationStyle,
  LearningMode,
  ExplainStatus,
  InteractStatus,
  BatchStatus,
  PracticeTier,
} from '@mentora/shared';
import { User } from '../models/User.model.js';
import { TopicSession } from '../models/TopicSession.model.js';
import { userRepository } from '../repositories/user.repository.js';
import { sessionRepository } from '../repositories/session.repository.js';

describe('IMP-005: User and TopicSession Repositories', () => {
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
    await User.deleteMany({});
    await TopicSession.deleteMany({});
  });

  describe('User Model & Repository', () => {
    it('creates a user with normalized email, default incomplete profile, and zero quota', async () => {
      const user = await userRepository.create({
        name: 'Ada Lovelace',
        email: '  ADA@EXAMPLE.COM  ',
        passwordHash: '$2a$12$somehashedpasswordstring',
      });

      expect(user).toBeDefined();
      expect(user._id).toBeDefined();
      expect(user.name).toBe('Ada Lovelace');
      expect(user.email).toBe('ada@example.com');
      // passwordHash MUST be excluded by default
      expect(user.passwordHash).toBeUndefined();

      // Profile defaults
      expect(user.profile.isCompleted).toBe(false);
      expect(user.profile.educationLevel).toBeNull();
      expect(user.profile.preferredStyle).toBeNull();

      // Quota defaults
      expect(user.usageQuota.dailyCount).toBe(0);
      expect(user.usageQuota.windowResetAt).toBeInstanceOf(Date);
    });

    it('findByEmail and findById exclude passwordHash by default', async () => {
      const created = await userRepository.create({
        name: 'Grace Hopper',
        email: 'grace@example.com',
        passwordHash: '$2a$12$gracepasswordhashstring',
      });

      const byEmail = await userRepository.findByEmail('GRACE@example.com');
      expect(byEmail).not.toBeNull();
      expect(byEmail?.email).toBe('grace@example.com');
      expect(byEmail?.passwordHash).toBeUndefined();

      const byId = await userRepository.findById(created._id.toString());
      expect(byId).not.toBeNull();
      expect(byId?.name).toBe('Grace Hopper');
      expect(byId?.passwordHash).toBeUndefined();
    });

    it('findByEmailWithPassword explicitly includes passwordHash', async () => {
      await userRepository.create({
        name: 'Alan Turing',
        email: 'alan@example.com',
        passwordHash: '$2a$12$alanhashstringforevaluation',
      });

      const userWithPass = await userRepository.findByEmailWithPassword('alan@example.com');
      expect(userWithPass).not.toBeNull();
      expect(userWithPass?.passwordHash).toBe('$2a$12$alanhashstringforevaluation');
    });

    it('throws duplicate key error when registering an existing email', async () => {
      await userRepository.create({
        name: 'User One',
        email: 'duplicate@example.com',
        passwordHash: '$2a$12$hash1',
      });

      await expect(
        userRepository.create({
          name: 'User Two',
          email: 'DUPLICATE@example.com',
          passwordHash: '$2a$12$hash2',
        })
      ).rejects.toThrow();
    });

    it('updateProfile sets educationLevel, preferredStyle, and marks isCompleted = true', async () => {
      const user = await userRepository.create({
        name: 'Margaret Hamilton',
        email: 'margaret@example.com',
        passwordHash: '$2a$12$margarethash',
      });

      const updated = await userRepository.updateProfile(user._id.toString(), {
        educationLevel: EducationLevel.UNDERGRADUATE,
        preferredStyle: ExplanationStyle.CONCISE_TECHNICAL,
      });

      expect(updated).not.toBeNull();
      expect(updated?.profile.isCompleted).toBe(true);
      expect(updated?.profile.educationLevel).toBe(EducationLevel.UNDERGRADUATE);
      expect(updated?.profile.preferredStyle).toBe(ExplanationStyle.CONCISE_TECHNICAL);
    });

    it('manages usageQuota increment and reset window', async () => {
      const user = await userRepository.create({
        name: 'Katherine Johnson',
        email: 'katherine@example.com',
        passwordHash: '$2a$12$katherinehash',
      });

      const userId = user._id.toString();

      // Increment quota
      const inc1 = await userRepository.incrementQuotaCount(userId);
      expect(inc1?.usageQuota.dailyCount).toBe(1);

      const inc2 = await userRepository.incrementQuotaCount(userId);
      expect(inc2?.usageQuota.dailyCount).toBe(2);

      // Window not expired yet -> reset returns null (no update)
      const noReset = await userRepository.resetQuotaWindowIfNeeded(
        userId,
        new Date(Date.now() - 1000)
      );
      expect(noReset).toBeNull();

      // Window expired -> resets dailyCount to 0 and extends window
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const resetUser = await userRepository.resetQuotaWindowIfNeeded(userId, futureDate);
      expect(resetUser).not.toBeNull();
      expect(resetUser?.usageQuota.dailyCount).toBe(0);
      expect(resetUser?.usageQuota.windowResetAt.getTime()).toBeGreaterThan(futureDate.getTime());
    });
  });

  describe('TopicSession Model & Repository (BR-02 & NFR-005)', () => {
    let userAId: string;
    let userBId: string;

    beforeEach(async () => {
      const userA = await userRepository.create({
        name: 'Learner A',
        email: 'learner.a@example.com',
        passwordHash: '$2a$12$hasha',
      });
      const userB = await userRepository.create({
        name: 'Learner B',
        email: 'learner.b@example.com',
        passwordHash: '$2a$12$hashb',
      });
      userAId = userA._id.toString();
      userBId = userB._id.toString();
    });

    it('initializes TopicSession with explainState not_started and practice batches easy=not_started, medium=locked, hard=locked (BR-02)', async () => {
      const session = await sessionRepository.create({
        userId: userAId,
        topicQuery: 'Deadlocks in Distributed Systems',
        normalizedTitle: 'Deadlocks in Distributed Systems',
        initialMode: LearningMode.EXPLAIN,
      });

      expect(session).toBeDefined();
      expect(session.userId.toString()).toBe(userAId);
      expect(session.topicQuery).toBe('Deadlocks in Distributed Systems');
      expect(session.lastActiveMode).toBe(LearningMode.EXPLAIN);

      // Explain state defaults
      expect(session.explainState.status).toBe(ExplainStatus.NOT_STARTED);
      expect(session.explainState.currentStepIndex).toBe(0);
      expect(session.explainState.cards).toEqual([]);

      // Interact state defaults
      expect(session.interactState.status).toBe(InteractStatus.NOT_STARTED);
      expect(session.interactState.strikeCount).toBe(0);
      expect(session.interactState.activeMilestoneIndex).toBe(0);
      expect(session.interactState.milestones).toEqual([]);

      // Practice state defaults (BR-02)
      expect(session.practiceState.activeTier).toBe(PracticeTier.EASY);
      expect(session.practiceState.batches.easy.status).toBe(BatchStatus.NOT_STARTED);
      expect(session.practiceState.batches.medium.status).toBe(BatchStatus.LOCKED);
      expect(session.practiceState.batches.hard.status).toBe(BatchStatus.LOCKED);
      expect(session.practiceState.batches.easy.score).toBeNull();
      expect(session.practiceState.batches.easy.questions).toEqual([]);
    });

    it('listSummariesByUserId returns only sessions belonging to the user sorted by updatedAt DESC', async () => {
      const sessionA1 = await sessionRepository.create({
        userId: userAId,
        topicQuery: 'Topic A1',
        normalizedTitle: 'Topic A1',
        initialMode: LearningMode.EXPLAIN,
      });

      // Small delay to ensure timestamp progression
      await new Promise((resolve) => setTimeout(resolve, 50));

      const sessionA2 = await sessionRepository.create({
        userId: userAId,
        topicQuery: 'Topic A2',
        normalizedTitle: 'Topic A2',
        initialMode: LearningMode.INTERACT,
      });

      await sessionRepository.create({
        userId: userBId,
        topicQuery: 'Topic B1',
        normalizedTitle: 'Topic B1',
        initialMode: LearningMode.PRACTICE,
      });

      const listA = await sessionRepository.listSummariesByUserId(userAId);
      expect(listA.length).toBe(2);
      expect(listA[0]?._id.toString()).toBe(sessionA2._id.toString());
      expect(listA[1]?._id.toString()).toBe(sessionA1._id.toString());

      const listB = await sessionRepository.listSummariesByUserId(userBId);
      expect(listB.length).toBe(1);
      expect(listB[0]?.topicQuery).toBe('Topic B1');
    });

    it('enforces multi-tenant ownership isolation (NFR-005)', async () => {
      const sessionA = await sessionRepository.create({
        userId: userAId,
        topicQuery: 'Private Session A',
        normalizedTitle: 'Private Session A',
        initialMode: LearningMode.EXPLAIN,
      });
      const sessionAId = sessionA._id.toString();

      // User B cannot find User A's session
      const foreignLookup = await sessionRepository.findByIdAndUserId(sessionAId, userBId);
      expect(foreignLookup).toBeNull();

      // User B cannot update User A's session
      const foreignUpdate = await sessionRepository.updateLastActiveMode(
        sessionAId,
        userBId,
        LearningMode.PRACTICE
      );
      expect(foreignUpdate).toBeNull();

      // Verify User A's session is unchanged in the database
      const unchanged = await sessionRepository.findByIdAndUserId(sessionAId, userAId);
      expect(unchanged?.lastActiveMode).toBe(LearningMode.EXPLAIN);

      // User B cannot delete User A's session
      const foreignDelete = await sessionRepository.deleteByIdAndUserId(sessionAId, userBId);
      expect(foreignDelete).toBe(false);

      // Verify User A's session still exists
      const stillExists = await sessionRepository.findByIdAndUserId(sessionAId, userAId);
      expect(stillExists).not.toBeNull();

      // User A can update and delete their own session
      const ownUpdate = await sessionRepository.updateLastActiveMode(
        sessionAId,
        userAId,
        LearningMode.INTERACT
      );
      expect(ownUpdate?.lastActiveMode).toBe(LearningMode.INTERACT);

      const ownDelete = await sessionRepository.deleteByIdAndUserId(sessionAId, userAId);
      expect(ownDelete).toBe(true);

      const deletedCheck = await sessionRepository.findByIdAndUserId(sessionAId, userAId);
      expect(deletedCheck).toBeNull();
    });

    it('returns null/false cleanly without throwing CastError on malformed ObjectIds', async () => {
      expect(await sessionRepository.findByIdAndUserId('invalid-id', userAId)).toBeNull();
      expect(await sessionRepository.findByIdAndUserId(new mongoose.Types.ObjectId().toString(), 'not-an-id')).toBeNull();
      expect(await sessionRepository.listSummariesByUserId('malformed-user-id')).toEqual([]);
      expect(
        await sessionRepository.updateLastActiveMode(
          'bad-session-id',
          userAId,
          LearningMode.PRACTICE
        )
      ).toBeNull();
      expect(await sessionRepository.deleteByIdAndUserId('bad-session-id', userAId)).toBe(false);
    });
  });
});
