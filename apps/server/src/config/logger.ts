import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'password',
      'passwordHash',
      'token',
      'GEMINI_API_KEY',
      'JWT_SECRET',
      'MONGODB_URI',
    ],
    censor: '[REDACTED]',
  },
});
