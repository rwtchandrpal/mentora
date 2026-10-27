import mongoose from 'mongoose';
import { EducationLevel, ExplanationStyle } from '@mentora/shared';
import { User, IUserDocument } from '../models/User.model.js';

export class UserRepository {
  async create(data: {
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<IUserDocument> {
    const created = await User.create({
      name: data.name.trim(),
      email: data.email.toLowerCase().trim(),
      passwordHash: data.passwordHash,
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

  async incrementQuotaCount(userId: string): Promise<IUserDocument | null> {
    if (!mongoose.isValidObjectId(userId)) {
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
}

export const userRepository = new UserRepository();
