import { GoogleGenAI, type Schema } from '@google/genai';
import { z } from 'zod';
import { ErrorCode } from '@mentora/shared';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';
import { AiOperation, ModelRouter } from './model.router.js';

let geminiClientInstance: GoogleGenAI | null = null;

export const MAX_STRUCTURED_RETRY_ATTEMPTS = 2;

export interface GenerateStructuredOutputOptions<T> {
  operation: AiOperation;
  systemInstruction: string;
  prompt: string;
  responseSchema: Schema | Record<string, unknown>;
  zodSchema: z.ZodType<T>;
  temperature?: number;
}

/**
 * Creates a new instance of the official GoogleGenAI SDK client.
 */
export const createGeminiClient = (apiKey: string = env.GEMINI_API_KEY): GoogleGenAI => {
  return new GoogleGenAI({ apiKey });
};

/**
 * Returns the singleton instance of GoogleGenAI initialized with env.GEMINI_API_KEY.
 * Supports dependency injection / mocking for unit tests so test suites never make live network calls.
 */
export const getGeminiClient = (): GoogleGenAI => {
  if (!geminiClientInstance) {
    geminiClientInstance = createGeminiClient();
  }
  return geminiClientInstance;
};

/**
 * Injects a mock or custom GoogleGenAI instance for testing.
 */
export const setGeminiClient = (client: GoogleGenAI | null): void => {
  geminiClientInstance = client;
};

/**
 * Resets the singleton instance to null (forces re-initialization on next get).
 */
export const resetGeminiClient = (): void => {
  geminiClientInstance = null;
};

/**
 * Executes a structured Gemini generation call with Zod validation and a single-retry guard.
 *
 * Rules:
 * 1. Resolves model dynamically via ModelRouter.getModelForOperation(operation).
 * 2. Parses JSON and validates against zodSchema.
 * 3. Educational Refusal Check (Edge Case 1 / FR-018): If isEducationalValid === false,
 *    immediately throws 422 EDUCATIONAL_GUARDRAIL_REFUSAL without retrying.
 * 4. Single-Retry Guard: On upstream SDK errors, empty text, invalid JSON, or Zod schema mismatches,
 *    automatically retries once (up to 2 attempts).
 * 5. If second attempt also fails, throws 502 AI_UPSTREAM_FAILURE.
 */
export const generateStructuredOutput = async <T>(
  options: GenerateStructuredOutputOptions<T>
): Promise<T> => {
  const { operation, systemInstruction, prompt, responseSchema, zodSchema, temperature } = options;
  const model = ModelRouter.getModelForOperation(operation);

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_STRUCTURED_RETRY_ATTEMPTS; attempt++) {
    try {
      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: responseSchema as Schema,
          ...(temperature !== undefined ? { temperature } : {}),
        },
      });

      const rawText = response.text;
      if (!rawText || rawText.trim().length === 0) {
        throw new Error('Gemini API returned an empty text response.');
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch (jsonErr) {
        throw new Error(
          `Failed to parse Gemini output as JSON: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`,
          { cause: jsonErr }
        );
      }

      // Educational Guardrail Refusal Check (Edge Case 1 / FR-018)
      // If the model explicitly flagged the topic/prompt as non-educational/harmful,
      // fail fast with 422 EDUCATIONAL_GUARDRAIL_REFUSAL without retrying.
      if (
        typeof parsedJson === 'object' &&
        parsedJson !== null &&
        'isEducationalValid' in parsedJson &&
        (parsedJson as Record<string, unknown>).isEducationalValid === false
      ) {
        const jsonRecord = parsedJson as Record<string, unknown>;
        const refusalReason =
          typeof jsonRecord.refusalReason === 'string' && jsonRecord.refusalReason.trim().length > 0
            ? jsonRecord.refusalReason.trim()
            : 'This topic or request falls outside Mentora educational scope.';

        logger.info(
          { operation, model, refusalReason },
          'Educational guardrail refusal triggered by Gemini structured output'
        );

        throw new AppError(
          422,
          ErrorCode.EDUCATIONAL_GUARDRAIL_REFUSAL,
          refusalReason
        );
      }

      // Runtime Zod Schema Validation
      const parseResult = zodSchema.safeParse(parsedJson);
      if (!parseResult.success) {
        const issuesSummary = parseResult.error.issues
          .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
          .join('; ');
        throw new Error(`Zod schema validation failed: ${issuesSummary}`);
      }

      return parseResult.data;
    } catch (err) {
      // Educational guardrail refusal is an intentional pedagogical decision, NOT a transient failure.
      if (
        err instanceof AppError &&
        err.errorCode === ErrorCode.EDUCATIONAL_GUARDRAIL_REFUSAL
      ) {
        throw err;
      }

      lastError = err;

      if (attempt < MAX_STRUCTURED_RETRY_ATTEMPTS) {
        logger.warn(
          {
            err: err instanceof Error ? { message: err.message, name: err.name } : err,
            operation,
            model,
            attempt,
            maxAttempts: MAX_STRUCTURED_RETRY_ATTEMPTS,
          },
          `Structured AI generation attempt ${attempt} failed; retrying once...`
        );
      }
    }
  }

  // All retry attempts exhausted
  logger.error(
    {
      err:
        lastError instanceof Error
          ? { message: lastError.message, name: lastError.name }
          : lastError,
      operation,
      model,
      attempts: MAX_STRUCTURED_RETRY_ATTEMPTS,
    },
    'Structured AI generation failed after single retry'
  );

  throw new AppError(
    502,
    ErrorCode.AI_UPSTREAM_FAILURE,
    'Failed to generate a valid structured AI response after retry.',
    {
      operation,
      cause: lastError instanceof Error ? lastError.message : String(lastError),
    }
  );
};
