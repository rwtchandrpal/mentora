import { z } from 'zod';
import {
  MIN_USER_NAME_LENGTH,
  MAX_USER_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from '../constants/index.js';
import { UserProfileStateSchema, UsageQuotaDTOSchema } from './profile.schema.js';

export const RegisterRequestSchema = z.object({
  name: z.string().trim().min(MIN_USER_NAME_LENGTH).max(MAX_USER_NAME_LENGTH),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

export const LoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const UserDTOSchema = z.object({
  id: z.string().min(1),
  _id: z.string().min(1).optional(),
  name: z.string().trim().min(MIN_USER_NAME_LENGTH).max(MAX_USER_NAME_LENGTH),
  email: z.string().email(),
  profile: UserProfileStateSchema,
  usageQuota: UsageQuotaDTOSchema,
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const AuthResponseDataSchema = z.object({
  token: z.string().min(1),
  user: UserDTOSchema,
});
