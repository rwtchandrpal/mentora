import { z } from 'zod';
import {
  MIN_USER_NAME_LENGTH,
  MAX_USER_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from '../constants/index.js';
import { UserProfileStateSchema, UsageQuotaDTOSchema } from './profile.schema.js';

const EMAIL_MESSAGE = 'Enter a valid email address';

export const RegisterRequestSchema = z.object({
  name: z
    .string({ error: 'Name is required' })
    .trim()
    .min(MIN_USER_NAME_LENGTH, `Name must be at least ${MIN_USER_NAME_LENGTH} characters`)
    .max(MAX_USER_NAME_LENGTH, `Name must be at most ${MAX_USER_NAME_LENGTH} characters`),
  email: z
    .string({ error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email(EMAIL_MESSAGE),
  password: z
    .string({ error: 'Password is required' })
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`),
});

export const LoginRequestSchema = z.object({
  email: z
    .string({ error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email(EMAIL_MESSAGE),
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
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
