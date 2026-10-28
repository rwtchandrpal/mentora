import mongoose from 'mongoose';
import { LearningMode } from '@mentora/shared';
import { TopicSession, ITopicSessionDocument } from '../models/TopicSession.model.js';

export class SessionRepository {
  async create(data: {
    userId: string;
    topicQuery: string;
    normalizedTitle: string;
    initialMode: LearningMode;
  }): Promise<ITopicSessionDocument> {
    if (!mongoose.isValidObjectId(data.userId)) {
      throw new Error(`Invalid userId ObjectId: ${data.userId}`);
    }

    const session = await TopicSession.create({
      userId: new mongoose.Types.ObjectId(data.userId),
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

  async listSummariesByUserId(userId: string): Promise<ITopicSessionDocument[]> {
    if (!mongoose.isValidObjectId(userId)) {
      return [];
    }
    return TopicSession.find({
      userId: new mongoose.Types.ObjectId(userId),
    })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async updateLastActiveMode(
    sessionId: string,
    userId: string,
    mode: LearningMode
  ): Promise<ITopicSessionDocument | null> {
    if (!mongoose.isValidObjectId(sessionId) || !mongoose.isValidObjectId(userId)) {
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

  async deleteByIdAndUserId(sessionId: string, userId: string): Promise<boolean> {
    if (!mongoose.isValidObjectId(sessionId) || !mongoose.isValidObjectId(userId)) {
      return false;
    }
    const result = await TopicSession.deleteOne({
      _id: new mongoose.Types.ObjectId(sessionId),
      userId: new mongoose.Types.ObjectId(userId),
    }).exec();

    return result.deletedCount === 1;
  }

  async save(session: ITopicSessionDocument): Promise<ITopicSessionDocument> {
    return session.save();
  }
}

export const sessionRepository = new SessionRepository();
