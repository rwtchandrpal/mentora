import mongoose from 'mongoose';
import { LearningMode, ErrorCode, GUEST_SESSION_TTL_SECONDS } from '@mentora/shared';
import { TopicSession, ITopicSessionDocument } from '../models/TopicSession.model.js';
import { AppError } from '../utils/AppError.js';

/** Fields needed for the sidebar history list; mode states are never loaded (A-12). */
export const SESSION_SUMMARY_FIELDS =
  'topicQuery normalizedTitle lastActiveMode createdAt updatedAt' as const;

export type SessionSummaryRecord = Pick<
  ITopicSessionDocument,
  '_id' | 'topicQuery' | 'normalizedTitle' | 'lastActiveMode' | 'createdAt' | 'updatedAt'
>;

export interface CreateSessionData {
  userId?: string | null;
  isGuest?: boolean;
  expiresAt?: Date | null;
  topicQuery: string;
  normalizedTitle: string;
  initialMode: LearningMode;
}

export class SessionRepository {
  async create(data: CreateSessionData): Promise<ITopicSessionDocument> {
    const isGuest = data.isGuest ?? !data.userId;
    let userObjectId: mongoose.Types.ObjectId | null = null;

    if (data.userId) {
      if (!mongoose.isValidObjectId(data.userId)) {
        throw new Error(`Invalid userId ObjectId: ${data.userId}`);
      }
      userObjectId = new mongoose.Types.ObjectId(data.userId);
    }

    const expiresAt = isGuest
      ? (data.expiresAt ?? new Date(Date.now() + GUEST_SESSION_TTL_SECONDS * 1000))
      : null;

    const session = await TopicSession.create({
      userId: userObjectId,
      isGuest,
      expiresAt,
      topicQuery: data.topicQuery.trim(),
      normalizedTitle: data.normalizedTitle.trim(),
      lastActiveMode: data.initialMode,
    });

    return session;
  }

  async findByIdAndUserId(
    sessionId: string,
    userId: string
  ): Promise<ITopicSessionDocument | null> {
    if (!mongoose.isValidObjectId(sessionId) || !mongoose.isValidObjectId(userId)) {
      return null;
    }
    return TopicSession.findOne({
      _id: new mongoose.Types.ObjectId(sessionId),
      userId: new mongoose.Types.ObjectId(userId),
    }).exec();
  }

  async findGuestSessionById(sessionId: string): Promise<ITopicSessionDocument | null> {
    if (!mongoose.isValidObjectId(sessionId)) {
      return null;
    }
    return TopicSession.findOne({
      _id: new mongoose.Types.ObjectId(sessionId),
      isGuest: true,
    }).exec();
  }

  async findSession(
    sessionId: string,
    userId?: string
  ): Promise<ITopicSessionDocument | null> {
    if (userId) {
      return this.findByIdAndUserId(sessionId, userId);
    }
    if (!mongoose.isValidObjectId(sessionId)) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
    }
    const session = await TopicSession.findById(new mongoose.Types.ObjectId(sessionId)).exec();
    if (!session || !session.isGuest) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
    }
    return session;
  }

  async listSummariesByUserId(userId: string): Promise<SessionSummaryRecord[]> {
    if (!mongoose.isValidObjectId(userId)) {
      return [];
    }
    return TopicSession.find({
      userId: new mongoose.Types.ObjectId(userId),
    })
      .select(SESSION_SUMMARY_FIELDS)
      .sort({ updatedAt: -1 })
      .lean<SessionSummaryRecord[]>()
      .exec();
  }

  async updateLastActiveMode(
    sessionId: string,
    userId: string | undefined,
    mode: LearningMode
  ): Promise<ITopicSessionDocument | null> {
    if (!mongoose.isValidObjectId(sessionId)) {
      if (!userId) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }
      return null;
    }
    if (userId) {
      if (!mongoose.isValidObjectId(userId)) {
        return null;
      }
      return TopicSession.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(sessionId),
          userId: new mongoose.Types.ObjectId(userId),
        },
        {
          $set: { lastActiveMode: mode },
        },
        { returnDocument: 'after' }
      ).exec();
    }

    const session = await TopicSession.findById(new mongoose.Types.ObjectId(sessionId)).exec();
    if (!session || !session.isGuest) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
    }

    return TopicSession.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(sessionId),
        isGuest: true,
      },
      {
        $set: { lastActiveMode: mode },
      },
      { returnDocument: 'after' }
    ).exec();
  }

  async deleteByIdAndUserId(sessionId: string, userId?: string): Promise<boolean> {
    if (!mongoose.isValidObjectId(sessionId)) {
      if (!userId) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }
      return false;
    }
    if (userId) {
      if (!mongoose.isValidObjectId(userId)) {
        return false;
      }
      const result = await TopicSession.deleteOne({
        _id: new mongoose.Types.ObjectId(sessionId),
        userId: new mongoose.Types.ObjectId(userId),
      }).exec();
      return result.deletedCount === 1;
    }

    const session = await TopicSession.findById(new mongoose.Types.ObjectId(sessionId)).exec();
    if (!session || !session.isGuest) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
    }

    const result = await TopicSession.deleteOne({
      _id: new mongoose.Types.ObjectId(sessionId),
      isGuest: true,
    }).exec();

    return result.deletedCount === 1;
  }

  async save(session: ITopicSessionDocument): Promise<ITopicSessionDocument> {
    return session.save();
  }

  /**
   * Applies `$set` only while the session still matches `guard` (A-07). Used after an
   * AI generation so that, when two requests generate concurrently, only the first
   * write lands. Returns null if this request lost the race (the guard no longer
   * matched), in which case the caller should re-read the winning document.
   */
  async setIfMatches(
    sessionId: mongoose.Types.ObjectId | string,
    guard: Record<string, unknown>,
    set: Record<string, unknown>
  ): Promise<ITopicSessionDocument | null> {
    return TopicSession.findOneAndUpdate(
      { _id: sessionId, ...guard },
      { $set: set },
      { returnDocument: 'after', runValidators: true }
    ).exec();
  }

  async findById(sessionId: mongoose.Types.ObjectId | string): Promise<ITopicSessionDocument | null> {
    if (!mongoose.isValidObjectId(sessionId)) {
      return null;
    }
    return TopicSession.findById(sessionId).exec();
  }
}

export const sessionRepository = new SessionRepository();
