import mongoose, { Model, Schema } from 'mongoose';

/**
 * Daily AI-action counter for unauthenticated guests, keyed by client IP.
 * Documents expire automatically (TTL index) once their window has passed, so the
 * collection stays bounded and needs no cleanup job.
 */
export interface IGuestQuota {
  _id: string;
  count: number;
  windowResetAt: Date;
}

export type GuestQuotaModel = Model<IGuestQuota>;

export const GuestQuotaSchema = new Schema<IGuestQuota>(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true, default: 0, min: 0 },
    windowResetAt: { type: Date, required: true },
  },
  { versionKey: false }
);

GuestQuotaSchema.index({ windowResetAt: 1 }, { expireAfterSeconds: 0 });

export const GuestQuota =
  (mongoose.models.GuestQuota as GuestQuotaModel) ||
  mongoose.model<IGuestQuota, GuestQuotaModel>('GuestQuota', GuestQuotaSchema);
