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
  GEMINI_REASONING_MODEL: z.string().trim().min(1).default('gemini-3.5-flash-lite'),
  DAILY_AI_QUOTA_LIMIT: z.coerce.number().int().positive().default(DAILY_AI_QUOTA_LIMIT),
  /**
   * Number of reverse-proxy hops in front of the server, passed to Express `trust proxy`.
   * `req.ip` (guest quota key and rate-limit key) is only the real client IP when this
   * matches the platform; too low and every client looks like the proxy.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),
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

/**
 * Picks the raw env object to validate.
 * - Test mode: defaults win, so a developer's shell can't change test behaviour.
 * - Standalone mode (e.g. `eval:ai`): real, non-empty values win and defaults
 *   only fill the gaps (A-26).
 * - Otherwise: the process env is used as is.
 */
export const resolveRawEnv = (rawEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => {
  if (rawEnv.NODE_ENV === 'test' && rawEnv.MENTORA_STANDALONE !== 'true') {
    return { ...rawEnv, ...TEST_ENV_DEFAULTS };
  }
  if (rawEnv.MENTORA_STANDALONE === 'true') {
    const provided = Object.fromEntries(
      Object.entries(rawEnv).filter(([, value]) => value !== undefined && value !== '')
    );
    return { ...TEST_ENV_DEFAULTS, ...provided };
  }
  return rawEnv;
};

export const env: Env = parseEnv(resolveRawEnv(process.env));
