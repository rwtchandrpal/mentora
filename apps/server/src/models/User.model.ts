import mongoose, { Document, Model, Schema } from 'mongoose';
import {
  EducationLevel,
  ExplanationStyle,
  MIN_USER_NAME_LENGTH,
  MAX_USER_NAME_LENGTH,
} from '@mentora/shared';

export interface IUserProfile {
  isCompleted: boolean;
  educationLevel: EducationLevel | null;
  preferredStyle: ExplanationStyle | null;
}

export interface IUsageQuota {
  dailyCount: number;
  windowResetAt: Date;
}

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  profile: IUserProfile;
  usageQuota: IUsageQuota;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document {
  _id: mongoose.Types.ObjectId;
}

export type UserModel = Model<IUserDocument>;

const UserProfileSchema = new Schema<IUserProfile>(
  {
    isCompleted: {
      type: Boolean,
      default: false,
    },
    educationLevel: {
      type: String,
      enum: Object.values(EducationLevel),
      default: null,
    },
    preferredStyle: {
      type: String,
      enum: Object.values(ExplanationStyle),
      default: null,
    },
  },
  { _id: false }
);

const UsageQuotaSchema = new Schema<IUsageQuota>(
  {
    dailyCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    windowResetAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  },
  { _id: false }
);

export const UserSchema = new Schema<IUserDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: MIN_USER_NAME_LENGTH,
      maxlength: MAX_USER_NAME_LENGTH,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    profile: {
      type: UserProfileSchema,
      default: () => ({
        isCompleted: false,
        educationLevel: null,
        preferredStyle: null,
      }),
    },
    usageQuota: {
      type: UsageQuotaSchema,
      default: () => ({
        dailyCount: 0,
        windowResetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }),
    },
  },
  {
    timestamps: true,
  }
);

export const User =
  (mongoose.models.User as UserModel) ||
  mongoose.model<IUserDocument, UserModel>('User', UserSchema);

export { User as UserModel };
