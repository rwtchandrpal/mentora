import { z } from 'zod';

export const ClientEnvSchema = z.object({
  VITE_API_BASE_URL: z
    .string({ message: 'VITE_API_BASE_URL is required' })
    .trim()
    .min(1, 'VITE_API_BASE_URL is required')
    .url('VITE_API_BASE_URL must be a valid URL'),
});

export type ClientEnv = z.infer<typeof ClientEnvSchema>;

const TEST_ENV_DEFAULTS: Record<string, string> = {
  VITE_API_BASE_URL: 'http://localhost:4000/api/v1',
};

export const getImportMetaEnv = (): Record<string, unknown> => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const isTestMode = import.meta.env.MODE === 'test';
    const baseUrl = import.meta.env.VITE_API_BASE_URL;

    if (isTestMode && !baseUrl) {
      return {
        ...TEST_ENV_DEFAULTS,
        ...import.meta.env,
      };
    }
    return { ...import.meta.env };
  }
  return {};
};

export const parseClientEnv = (rawEnv?: Record<string, unknown>): ClientEnv => {
  const envToValidate = rawEnv ?? getImportMetaEnv();
  const result = ClientEnvSchema.safeParse(envToValidate);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'VITE_API_BASE_URL'}: ${issue.message}`)
      .join(', ');
    throw new Error(
      `[Mentora Client Env Validation Error] Invalid environment configuration: ${errorDetails}`
    );
  }

  return result.data;
};

export const env: ClientEnv = parseClientEnv();
