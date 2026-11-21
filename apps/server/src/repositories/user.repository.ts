import mongoose from 'mongoose';
import { EducationLevel, ExplanationStyle } from '@mentora/shared';
import { User, IUserDocument } from '../models/User.model.js';

export class UserRepository {
  async create(data: {
    name: string;
    email: string;
    passwordHash: string;
    profile?: {
      isCompleted: boolean;
      educationLevel: EducationLevel | null;
      preferredStyle: ExplanationStyle | null;
    };
  }): Promise<IUserDocument> {
    const created = await User.create({
      name: data.name.trim(),
      email: data.email.toLowerCase().trim(),
      passwordHash: data.passwordHash,
      ...(data.profile ? { profile: data.profile } : {}),
    });
    const doc = await User.findById(created._id).exec();
    return doc ?? created;
  }

  async findByEmail(email: string): Promise<IUserDocument | null> {
    const normalizedEmail = email.toLowerCase().trim();
    return User.findOne({ email: normalizedEmail }).exec();
  }

  async findByEmailWithPassword(email: string): Promise<IUserDocument | null> {
    const normalizedEmail = email.toLowerCase().trim();
    return User.findOne({ email: normalizedEmail }).select('+passwordHash').exec();
  }

  async findById(userId: string): Promise<IUserDocument | null> {
    if (!mongoose.isValidObjectId(userId)) {
      return null;
    }
    return User.findById(userId).exec();
  }

  async updateProfile(
    userId: string,
    profile: { educationLevel: EducationLevel; preferredStyle: ExplanationStyle }
  ): Promise<IUserDocument | null> {
    if (!mongoose.isValidObjectId(userId)) {
      return null;
    }
    return User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'profile.educationLevel': profile.educationLevel,
          'profile.preferredStyle': profile.preferredStyle,
          'profile.isCompleted': true,
        },
      },
      { returnDocument: 'after' }
    ).exec();
  }

  async resetQuotaWindowIfNeeded(
    userId: string,
    now: Date = new Date()
  ): Promise<IUserDocument | null> {
    if (!mongoose.isValidObjectId(userId)) {
      return null;
    }

    const nextReset = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return User.findOneAndUpdate(
      {
        _id: userId,
        'usageQuota.windowResetAt': { $lte: now },
      },
      {
        $set: {
          'usageQuota.dailyCount': 0,
          'usageQuota.windowResetAt': nextReset,
        },
      },
      { returnDocument: 'after' }
    ).exec();
  }

  async syncQuotaWindow(
    userId: string,
    now: Date = new Date()
  ): Promise<IUserDocument | null> {
    if (!mongoose.isValidObjectId(userId)) {
      return null;
    }

    const reset = await this.resetQuotaWindowIfNeeded(userId, now);
    if (reset) {
      return reset;
    }

    return User.findById(userId).exec();
  }

  /**
   * Atomically consumes one quota unit if the user is still under `limit` (A-07).
   * The count check and the increment happen in one conditional update, so parallel
   * requests cannot both pass a stale read. Returns null when the limit is reached
   * (or the user does not exist).
   *
   * The window roll-over is folded into the same update pipeline, so a reservation is a
   * single `User` query (A-13): an expired window restarts at 1, a live window is
   * incremented only while under `limit`.
   */
  async tryReserveQuota(
    userId: string,
    limit: number,
    now: Date = new Date()
  ): Promise<IUserDocument | null> {
    if (!mongoose.isValidObjectId(userId)) {
      return null;
    }

    if (limit <= 0) {
      return null;
    }

    const nextReset = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const windowExpired = { $lte: ['$usageQuota.windowResetAt', now] };

    return User.findOneAndUpdate(
      {
        _id: userId,
        $or: [
          { 'usageQuota.windowResetAt': { $lte: now } },
          { 'usageQuota.dailyCount': { $lt: limit } },
        ],
      },
      [
        {
          $set: {
            'usageQuota.dailyCount': {
              $cond: [windowExpired, 1, { $add: ['$usageQuota.dailyCount', 1] }],
            },
            'usageQuota.windowResetAt': {
              $cond: [windowExpired, nextReset, '$usageQuota.windowResetAt'],
            },
          },
        },
      ],
      { returnDocument: 'after', updatePipeline: true }
    ).exec();
  }

  /**
   * Gives back one reserved quota unit. Only applies to the window the unit was
   * reserved in, and never drops below zero.
   */
  async releaseQuota(
    userId: string,
    windowResetAt: Date
  ): Promise<IUserDocument | null> {
    if (!mongoose.isValidObjectId(userId)) {
      return null;
    }

    const released = await User.findOneAndUpdate(
      {
        _id: userId,
        'usageQuota.dailyCount': { $gt: 0 },
        'usageQuota.windowResetAt': windowResetAt,
      },
      { $inc: { 'usageQuota.dailyCount': -1 } },
      { returnDocument: 'after' }
    ).exec();

    return released ?? User.findById(userId).exec();
  }

  async incrementQuotaCount(
    userId: string,
    now: Date = new Date()
  ): Promise<IUserDocument | null> {
    if (!mongoose.isValidObjectId(userId)) {
      return null;
    }

    const synced = await this.syncQuotaWindow(userId, now);
    if (!synced) {
      return null;
    }

    return User.findByIdAndUpdate(
      userId,
      {
        $inc: { 'usageQuota.dailyCount': 1 },
      },
      { returnDocument: 'after' }
    ).exec();
  }

  async incrementUserQuota(
    userId: string,
    now: Date = new Date()
  ): Promise<IUserDocument | null> {
    return this.incrementQuotaCount(userId, now);
  }
}

export const userRepository = new UserRepository();
