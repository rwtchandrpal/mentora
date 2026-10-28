import { env } from '../config/env.js';

export const AiOperation = {
  EXPLAIN_INIT: 'EXPLAIN_INIT',
  EXPLAIN_DEEPER: 'EXPLAIN_DEEPER',
  INTERACT_INIT: 'INTERACT_INIT',
  INTERACT_STREAM: 'INTERACT_STREAM',
  PRACTICE_GENERATE: 'PRACTICE_GENERATE',
} as const;

export type AiOperation = (typeof AiOperation)[keyof typeof AiOperation];

export const AI_OPERATIONS = [
  AiOperation.EXPLAIN_INIT,
  AiOperation.EXPLAIN_DEEPER,
  AiOperation.INTERACT_INIT,
  AiOperation.INTERACT_STREAM,
  AiOperation.PRACTICE_GENERATE,
] as const;

export interface ModelRouterOptions {
  fastModel?: string;
  reasoningModel?: string;
}

/**
 * Resolves the designated Gemini model for a given AI operation.
 * Reads dynamically from validated env variables (never hardcoded strings):
 * - EXPLAIN_INIT, INTERACT_INIT, INTERACT_STREAM -> env.GEMINI_FAST_MODEL
 * - EXPLAIN_DEEPER, PRACTICE_GENERATE -> env.GEMINI_REASONING_MODEL
 */
export const resolveModelForOperation = (
  operation: AiOperation,
  options?: ModelRouterOptions
): string => {
  const fastModel = options?.fastModel ?? env.GEMINI_FAST_MODEL;
  const reasoningModel = options?.reasoningModel ?? env.GEMINI_REASONING_MODEL;

  switch (operation) {
    case AiOperation.EXPLAIN_INIT:
    case AiOperation.INTERACT_INIT:
    case AiOperation.INTERACT_STREAM:
      return fastModel;
    case AiOperation.EXPLAIN_DEEPER:
    case AiOperation.PRACTICE_GENERATE:
      return reasoningModel;
    default: {
      const _exhaustiveCheck: never = operation;
      throw new Error(`Unhandled AI operation: ${String(_exhaustiveCheck)}`);
    }
  }
};

export const ModelRouter = {
  getModelForOperation: resolveModelForOperation,
} as const;

