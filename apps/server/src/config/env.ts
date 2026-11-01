import 'dotenv/config';
import { z } from 'zod';
import { DAILY_AI_QUOTA_LIMIT } from '@mentora/shared';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().trim().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().trim().min(1).default('7d'),
  CLIENT_ORIGIN: z.string().url('CLIENT_ORIGIN must be a valid URL'),
  GEMINI_API_KEY: z.string().trim().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_FAST_MODEL: z.string().trim().min(1).default('gemini-3.5-flash-lite'),
  GEMINI_REASONING_MODEL: z.string().trim().min(1).default('gemini-3.6-pro'),
  DAILY_AI_QUOTA_LIMIT: z.coerce.number().int().positive().default(DAILY_AI_QUOTA_LIMIT),
});

export type Env = z.infer<typeof EnvSchema>;

export const parseEnv = (rawEnv: NodeJS.ProcessEnv = process.env): Env => {
  return EnvSchema.parse(rawEnv);
};

const TEST_ENV_DEFAULTS: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  PORT: '4000',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/mentora_test',
  JWT_SECRET: 'test-secret-at-least-32-characters-long-key',
  JWT_EXPIRES_IN: '7d',
  CLIENT_ORIGIN: 'http://localhost:5173',
  GEMINI_API_KEY: 'test-gemini-api-key',
  GEMINI_FAST_MODEL: 'gemini-3.5-flash-lite',
  GEMINI_REASONING_MODEL: 'gemini-3.6-pro',
  DAILY_AI_QUOTA_LIMIT: String(DAILY_AI_QUOTA_LIMIT),
};

export const env: Env =
  process.env.NODE_ENV === 'test' || process.env.MENTORA_STANDALONE === 'true'
    ? parseEnv({
        ...process.env,
        ...TEST_ENV_DEFAULTS,
      })
    : parseEnv(process.env);
