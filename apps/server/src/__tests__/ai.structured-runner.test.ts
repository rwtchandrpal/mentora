import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import {
  ErrorCode,
  ExplainStepType,
  ExplainInitOutputSchema,
  InteractInitOutputSchema,
} from '@mentora/shared';
import type { GoogleGenAI } from '@google/genai';
import { AppError } from '../utils/AppError.js';
import {
  generateStructuredOutput,
  setGeminiClient,
  resetGeminiClient,
} from '../ai/gemini.client.js';
import { AiOperation } from '../ai/model.router.js';
import {
  explainInitGeminiSchema,
  explainDeepDiveGeminiSchema,
  interactInitGeminiSchema,
  practiceQuestionGeminiSchema,
  practiceBatchGeminiSchema,
  PRACTICE_MCQ_GEMINI_PROPERTY_ORDER,
} from '../ai/schemas/index.js';

describe('IMP-014: Gemini Structured Output Schemas & Validation Runner', () => {
  beforeEach(() => {
    resetGeminiClient();
  });

  afterEach(() => {
    resetGeminiClient();
    vi.restoreAllMocks();
  });

  describe('1. First-Pass Success', () => {
    it('returns strongly typed data on attempt 1 when valid JSON is returned', async () => {
      const validPayload = {
        isEducationalValid: true,
        cards: [
          {
            stepNumber: 1,
            stepType: ExplainStepType.INTUITION,
            title: 'Intuition of Recursion',
            contentMarkdown: 'Recursion is like Russian nesting dolls.',
            checkQuestion: null,
            checkAnswer: null,
            deepDives: [],
          },
          {
            stepNumber: 2,
            stepType: ExplainStepType.CORE_MECHANISM,
            title: 'Call Stack & Base Case',
            contentMarkdown: 'Base cases stop the recursive unwinding.',
            checkQuestion: null,
            checkAnswer: null,
            deepDives: [],
          },
          {
            stepNumber: 3,
            stepType: ExplainStepType.EXAMPLE,
            title: 'Factorial Walkthrough',
            contentMarkdown: '```python\ndef fact(n): ...\n```',
            checkQuestion: null,
            checkAnswer: null,
            deepDives: [],
          },
          {
            stepNumber: 4,
            stepType: ExplainStepType.CHECK_FOR_UNDERSTANDING,
            title: 'Self Check',
            contentMarkdown: 'What happens without a base case?',
            checkQuestion: 'What error occurs?',
            checkAnswer: 'Stack Overflow.',
            deepDives: [],
          },
        ],
        suggestedSubTopics: ['Tail Recursion', 'Dynamic Programming'],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify(validPayload),
      });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      const result = await generateStructuredOutput({
        operation: AiOperation.EXPLAIN_INIT,
        systemInstruction: 'You are Mentora.',
        prompt: 'Explain Recursion',
        responseSchema: explainInitGeminiSchema,
        zodSchema: ExplainInitOutputSchema,
      });

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(result.isEducationalValid).toBe(true);
      expect(result.cards).toHaveLength(4);
      expect(result.cards[0]?.title).toBe('Intuition of Recursion');
    });
  });

  describe('2. Single-Retry Recovery on Invalid JSON or Schema Failure', () => {
    it('retries once and succeeds if attempt 1 returns malformed JSON and attempt 2 returns valid JSON', async () => {
      const validPayload = {
        title: 'Deep Dive into Virtual Memory',
        contentMarkdown: 'Detailed explanation of page tables and TLBs.',
      };

      const mockGenerateContent = vi
        .fn()
        .mockResolvedValueOnce({
          text: '{ invalid json text: missing quotes and brackets',
        })
        .mockResolvedValueOnce({
          text: JSON.stringify(validPayload),
        });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      const SimpleSchema = z.object({
        title: z.string(),
        contentMarkdown: z.string(),
      });

      const result = await generateStructuredOutput({
        operation: AiOperation.EXPLAIN_DEEPER,
        systemInstruction: 'You are Mentora.',
        prompt: 'Go Deeper on Virtual Memory',
        responseSchema: explainDeepDiveGeminiSchema,
        zodSchema: SimpleSchema,
      });

      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      expect(result.title).toBe('Deep Dive into Virtual Memory');
    });

    it('retries once and succeeds if attempt 1 fails Zod validation and attempt 2 satisfies Zod validation', async () => {
      const invalidZodPayload = {
        // Missing required 'title'
        contentMarkdown: 'Only content markdown provided.',
      };

      const validZodPayload = {
        title: 'Page Tables & MMU',
        contentMarkdown: 'Only content markdown provided with title.',
      };

      const mockGenerateContent = vi
        .fn()
        .mockResolvedValueOnce({
          text: JSON.stringify(invalidZodPayload),
        })
        .mockResolvedValueOnce({
          text: JSON.stringify(validZodPayload),
        });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      const SimpleSchema = z.object({
        title: z.string().min(1),
        contentMarkdown: z.string().min(1),
      });

      const result = await generateStructuredOutput({
        operation: AiOperation.EXPLAIN_DEEPER,
        systemInstruction: 'You are Mentora.',
        prompt: 'Deep dive',
        responseSchema: explainDeepDiveGeminiSchema,
        zodSchema: SimpleSchema,
      });

      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      expect(result.title).toBe('Page Tables & MMU');
    });
  });

  describe('3. Second-Attempt Failure (502 AI_UPSTREAM_FAILURE)', () => {
    it('throws AppError 502 with ErrorCode.AI_UPSTREAM_FAILURE after 2 consecutive malformed JSON attempts', async () => {
      const mockGenerateContent = vi
        .fn()
        .mockResolvedValueOnce({
          text: 'malformed attempt 1',
        })
        .mockResolvedValueOnce({
          text: 'malformed attempt 2',
        });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      const DummySchema = z.object({ value: z.string() });

      await expect(
        generateStructuredOutput({
          operation: AiOperation.EXPLAIN_INIT,
          systemInstruction: 'System',
          prompt: 'Prompt',
          responseSchema: explainInitGeminiSchema,
          zodSchema: DummySchema,
        })
      ).rejects.toThrowError(AppError);

      expect(mockGenerateContent).toHaveBeenCalledTimes(2);

      try {
        await generateStructuredOutput({
          operation: AiOperation.EXPLAIN_INIT,
          systemInstruction: 'System',
          prompt: 'Prompt',
          responseSchema: explainInitGeminiSchema,
          zodSchema: DummySchema,
        });
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(502);
        expect(appErr.errorCode).toBe(ErrorCode.AI_UPSTREAM_FAILURE);
      }
    });

    it('throws AppError 502 with ErrorCode.AI_UPSTREAM_FAILURE when response text is empty on both attempts', async () => {
      const mockGenerateContent = vi
        .fn()
        .mockResolvedValueOnce({ text: '' })
        .mockResolvedValueOnce({ text: '   ' });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      const DummySchema = z.object({ value: z.string() });

      try {
        await generateStructuredOutput({
          operation: AiOperation.EXPLAIN_INIT,
          systemInstruction: 'System',
          prompt: 'Prompt',
          responseSchema: explainInitGeminiSchema,
          zodSchema: DummySchema,
        });
        expect.fail('Should have thrown AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(502);
        expect(appErr.errorCode).toBe(ErrorCode.AI_UPSTREAM_FAILURE);
      }

      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });
  });

  describe('4. Upstream SDK Reject / Timeout Failure (502 AI_UPSTREAM_FAILURE)', () => {
    it('retries once and throws AppError 502 when upstream generateContent rejects on both attempts', async () => {
      const mockGenerateContent = vi
        .fn()
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockRejectedValueOnce(new Error('503 Service Unavailable'));

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      const DummySchema = z.object({ value: z.string() });

      try {
        await generateStructuredOutput({
          operation: AiOperation.PRACTICE_GENERATE,
          systemInstruction: 'System',
          prompt: 'Prompt',
          responseSchema: practiceBatchGeminiSchema,
          zodSchema: DummySchema,
        });
        expect.fail('Should have thrown AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(502);
        expect(appErr.errorCode).toBe(ErrorCode.AI_UPSTREAM_FAILURE);
      }

      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it('recovers cleanly if upstream generateContent rejects on attempt 1 but succeeds on attempt 2', async () => {
      const validPayload = { value: 'recovered' };
      const mockGenerateContent = vi
        .fn()
        .mockRejectedValueOnce(new Error('Temporary network glitch'))
        .mockResolvedValueOnce({
          text: JSON.stringify(validPayload),
        });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      const DummySchema = z.object({ value: z.string() });

      const result = await generateStructuredOutput({
        operation: AiOperation.INTERACT_INIT,
        systemInstruction: 'System',
        prompt: 'Prompt',
        responseSchema: interactInitGeminiSchema,
        zodSchema: DummySchema,
      });

      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      expect(result.value).toBe('recovered');
    });
  });

  describe('5. Educational Guardrail Refusal (422 EDUCATIONAL_GUARDRAIL_REFUSAL)', () => {
    it('immediately throws AppError 422 with ErrorCode.EDUCATIONAL_GUARDRAIL_REFUSAL without retrying', async () => {
      const refusalPayload = {
        isEducationalValid: false,
        refusalReason: 'Mentora is exclusively dedicated to academic, scientific, and technical education. Please provide a study topic.',
        cards: [],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify(refusalPayload),
      });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      try {
        await generateStructuredOutput({
          operation: AiOperation.EXPLAIN_INIT,
          systemInstruction: 'System',
          prompt: 'Write spam email templates',
          responseSchema: explainInitGeminiSchema,
          zodSchema: ExplainInitOutputSchema,
        });
        expect.fail('Should have thrown AppError for guardrail refusal');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(422);
        expect(appErr.errorCode).toBe(ErrorCode.EDUCATIONAL_GUARDRAIL_REFUSAL);
        expect(appErr.message).toBe(refusalPayload.refusalReason);
      }

      // Must be called exactly ONCE: zero retries on legitimate refusal
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('uses fallback message when refusalReason is omitted or blank', async () => {
      const refusalPayload = {
        isEducationalValid: false,
        refusalReason: '',
      };

      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify(refusalPayload),
      });

      setGeminiClient({
        models: { generateContent: mockGenerateContent },
      } as unknown as GoogleGenAI);

      try {
        await generateStructuredOutput({
          operation: AiOperation.INTERACT_INIT,
          systemInstruction: 'System',
          prompt: 'Non-educational prompt',
          responseSchema: interactInitGeminiSchema,
          zodSchema: InteractInitOutputSchema,
        });
        expect.fail('Should have thrown AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(422);
        expect(appErr.errorCode).toBe(ErrorCode.EDUCATIONAL_GUARDRAIL_REFUSAL);
        expect(appErr.message).toContain('educational scope');
      }

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });
  });

  describe('6. Reasoning-First Practice MCQ Schema Verification (FR-017)', () => {
    it('ensures solutionExplanation strictly precedes correctOptionIndex in property key order', () => {
      const propertyKeys = Object.keys(practiceQuestionGeminiSchema.properties ?? {});

      const solutionExplanationIndex = propertyKeys.indexOf('solutionExplanation');
      const correctOptionIndexIndex = propertyKeys.indexOf('correctOptionIndex');

      expect(solutionExplanationIndex).toBeGreaterThan(-1);
      expect(correctOptionIndexIndex).toBeGreaterThan(-1);
      expect(solutionExplanationIndex).toBeLessThan(correctOptionIndexIndex);
    });

    it('ensures solutionExplanation strictly precedes correctOptionIndex in propertyOrdering array', () => {
      const ordering = practiceQuestionGeminiSchema.propertyOrdering;
      expect(ordering).toBeDefined();
      expect(Array.isArray(ordering)).toBe(true);

      const solutionIndex = ordering!.indexOf('solutionExplanation');
      const correctIndex = ordering!.indexOf('correctOptionIndex');

      expect(solutionIndex).toBeGreaterThan(-1);
      expect(correctIndex).toBeGreaterThan(-1);
      expect(solutionIndex).toBeLessThan(correctIndex);
    });

    it('matches PRACTICE_MCQ_GEMINI_PROPERTY_ORDER constant', () => {
      expect(PRACTICE_MCQ_GEMINI_PROPERTY_ORDER).toEqual([
        'questionNumber',
        'questionText',
        'options',
        'hint',
        'solutionExplanation',
        'correctOptionIndex',
      ]);
    });

    it('ensures practiceBatchGeminiSchema embeds the reasoning-first question schema', () => {
      expect(practiceBatchGeminiSchema.properties?.questions).toBeDefined();
      expect(practiceBatchGeminiSchema.properties?.questions?.items).toBe(
        practiceQuestionGeminiSchema
      );
    });
  });
});

