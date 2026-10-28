import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EducationLevel,
  ExplanationStyle,
  LearningMode,
  type StaticLearnerProfile,
} from '@mentora/shared';
import { env } from '../config/env.js';
import {
  AiOperation,
  AI_OPERATIONS,
  ModelRouter,
  resolveModelForOperation,
} from '../ai/model.router.js';
import {
  PromptBuilder,
  buildSystemInstruction,
  buildExplainInitPrompt,
  buildExplainDeeperPrompt,
  buildInteractInitPrompt,
  buildInteractTurnPrompt,
  buildPracticeGeneratePrompt,
} from '../ai/prompts/prompt.builder.js';
import {
  getGeminiClient,
  setGeminiClient,
  resetGeminiClient,
  createGeminiClient,
} from '../ai/gemini.client.js';
import { GoogleGenAI } from '@google/genai';

describe('IMP-013: Backend AI Integration Layer', () => {
  describe('Dual-Model Router (model.router.ts)', () => {
    it('maps EXPLAIN_INIT, INTERACT_INIT, and INTERACT_STREAM to env.GEMINI_FAST_MODEL', () => {
      expect(ModelRouter.getModelForOperation(AiOperation.EXPLAIN_INIT)).toBe(env.GEMINI_FAST_MODEL);
      expect(ModelRouter.getModelForOperation(AiOperation.INTERACT_INIT)).toBe(env.GEMINI_FAST_MODEL);
      expect(ModelRouter.getModelForOperation(AiOperation.INTERACT_STREAM)).toBe(env.GEMINI_FAST_MODEL);
    });

    it('maps EXPLAIN_DEEPER and PRACTICE_GENERATE to env.GEMINI_REASONING_MODEL', () => {
      expect(ModelRouter.getModelForOperation(AiOperation.EXPLAIN_DEEPER)).toBe(env.GEMINI_REASONING_MODEL);
      expect(ModelRouter.getModelForOperation(AiOperation.PRACTICE_GENERATE)).toBe(env.GEMINI_REASONING_MODEL);
    });

    it('covers all AI_OPERATIONS without unhandled cases', () => {
      expect(AI_OPERATIONS).toHaveLength(5);
      for (const op of AI_OPERATIONS) {
        const model = resolveModelForOperation(op);
        expect(typeof model).toBe('string');
        expect(model.length).toBeGreaterThan(0);
      }
    });

    it('dynamically reflects changes to configured environment variables rather than hardcoded strings', () => {
      const customFast = 'custom-gemini-fast-model-v2';
      const customReasoning = 'custom-gemini-reasoning-model-pro';

      // Test with custom options
      expect(
        resolveModelForOperation(AiOperation.EXPLAIN_INIT, {
          fastModel: customFast,
          reasoningModel: customReasoning,
        })
      ).toBe(customFast);

      expect(
        resolveModelForOperation(AiOperation.PRACTICE_GENERATE, {
          fastModel: customFast,
          reasoningModel: customReasoning,
        })
      ).toBe(customReasoning);

      // Mutate env object directly to verify live evaluation without hardcoded fallbacks
      const originalFast = env.GEMINI_FAST_MODEL;
      const originalReasoning = env.GEMINI_REASONING_MODEL;
      const mutableEnv = env as { GEMINI_FAST_MODEL: string; GEMINI_REASONING_MODEL: string };

      try {
        mutableEnv.GEMINI_FAST_MODEL = 'gemini-dynamic-fast';
        mutableEnv.GEMINI_REASONING_MODEL = 'gemini-dynamic-reasoning';

        expect(ModelRouter.getModelForOperation(AiOperation.EXPLAIN_INIT)).toBe('gemini-dynamic-fast');
        expect(ModelRouter.getModelForOperation(AiOperation.INTERACT_INIT)).toBe('gemini-dynamic-fast');
        expect(ModelRouter.getModelForOperation(AiOperation.INTERACT_STREAM)).toBe('gemini-dynamic-fast');
        expect(ModelRouter.getModelForOperation(AiOperation.EXPLAIN_DEEPER)).toBe('gemini-dynamic-reasoning');
        expect(ModelRouter.getModelForOperation(AiOperation.PRACTICE_GENERATE)).toBe('gemini-dynamic-reasoning');
      } finally {
        mutableEnv.GEMINI_FAST_MODEL = originalFast;
        mutableEnv.GEMINI_REASONING_MODEL = originalReasoning;
      }
    });
  });

  describe('Pedagogical Prompt Builder (prompt.builder.ts)', () => {
    it('generates distinct pedagogical instructions across all 9 profile combinations (3 EducationLevel x 3 ExplanationStyle)', () => {
      const educationLevels = [
        EducationLevel.HIGH_SCHOOL,
        EducationLevel.UNDERGRADUATE,
        EducationLevel.PROFESSIONAL,
      ];
      const explanationStyles = [
        ExplanationStyle.VISUAL,
        ExplanationStyle.ANALOGY_HEAVY,
        ExplanationStyle.CONCISE_TECHNICAL,
      ];

      const promptOutputs = new Set<string>();

      for (const level of educationLevels) {
        for (const style of explanationStyles) {
          const profile: StaticLearnerProfile = {
            educationLevel: level,
            preferredStyle: style,
          };
          const instruction = PromptBuilder.buildSystemInstruction(profile, LearningMode.EXPLAIN);
          promptOutputs.add(instruction);

          // Verify specific level directive is present
          if (level === EducationLevel.HIGH_SCHOOL) {
            expect(instruction).toContain('Education Level Calibration: High School');
            expect(instruction).toContain('relatable everyday experiences');
          } else if (level === EducationLevel.UNDERGRADUATE) {
            expect(instruction).toContain('Education Level Calibration: Undergraduate');
            expect(instruction).toContain('University-level');
          } else if (level === EducationLevel.PROFESSIONAL) {
            expect(instruction).toContain('Education Level Calibration: Professional');
            expect(instruction).toContain('production architecture trade-offs');
          }

          // Verify specific style directive is present
          if (style === ExplanationStyle.VISUAL) {
            expect(instruction).toContain('Explanation Style Calibration: Visual');
            expect(instruction).toContain('Mermaid.js');
          } else if (style === ExplanationStyle.ANALOGY_HEAVY) {
            expect(instruction).toContain('Explanation Style Calibration: Analogy-Heavy');
            expect(instruction).toContain('everyday metaphor');
          } else if (style === ExplanationStyle.CONCISE_TECHNICAL) {
            expect(instruction).toContain('Explanation Style Calibration: Concise & Technical');
            expect(instruction).toContain('Eliminate conversational filler');
          }
        }
      }

      // Exactly 9 unique combinations
      expect(promptOutputs.size).toBe(9);
    });

    it('includes universal educational safety guardrails and overly broad topic handling', () => {
      const profile: StaticLearnerProfile = {
        educationLevel: EducationLevel.UNDERGRADUATE,
        preferredStyle: ExplanationStyle.VISUAL,
      };
      const instruction = buildSystemInstruction(profile, LearningMode.EXPLAIN);

      expect(instruction).toContain('Educational Scope & Safety Guardrails');
      expect(instruction).toContain('You are Mentora');
      expect(instruction).toContain('isEducationalValid": false');
      expect(instruction).toContain('Overly Broad Topics (Edge Case 2)');
      expect(instruction).toContain('foundational pillars');
    });

    it('enforces strict LaTeX math, fenced code block, and quoted Mermaid node label formatting contracts', () => {
      const profile: StaticLearnerProfile = {
        educationLevel: EducationLevel.PROFESSIONAL,
        preferredStyle: ExplanationStyle.CONCISE_TECHNICAL,
      };
      const instruction = buildSystemInstruction(profile, LearningMode.PRACTICE);

      expect(instruction).toContain('Technical Formatting Contract');
      expect(instruction).toContain('$...$');
      expect(instruction).toContain('$$...$$');
      expect(instruction).toContain('NEVER use \\( ... \\) or \\[ ... \\]');
      expect(instruction).toContain('fenced code block');
      expect(instruction).toContain('A["Client Application (Browser)"]');
      expect(instruction).toContain('mermaid.parse()');
    });

    it('injects mode-specific instructions for EXPLAIN, INTERACT, and PRACTICE', () => {
      const profile: StaticLearnerProfile = {
        educationLevel: EducationLevel.UNDERGRADUATE,
        preferredStyle: ExplanationStyle.ANALOGY_HEAVY,
      };

      const explainInstruction = buildSystemInstruction(profile, LearningMode.EXPLAIN);
      expect(explainInstruction).toContain('Learning Mode: Explain Mode');
      expect(explainInstruction).toContain('Step 1 — Intuition');
      expect(explainInstruction).toContain('Step 2 — Core Mechanism');
      expect(explainInstruction).toContain('Step 3 — Example');
      expect(explainInstruction).toContain('Step 4 — Check-for-Understanding');

      const interactInstruction = buildSystemInstruction(profile, LearningMode.INTERACT);
      expect(interactInstruction).toContain('Interact Mode (Socratic Dialogue & 3-Strike Circuit Breaker)');
      expect(interactInstruction).toContain('3-Strike Socratic Circuit Breaker Protocol');
      expect(interactInstruction).toContain('<<MENTORA_STATE:{"outcome":"ADVANCE"|"STRIKE"|"CIRCUIT_BREAKER_ACK"}>>');

      const practiceInstruction = buildSystemInstruction(profile, LearningMode.PRACTICE);
      expect(practiceInstruction).toContain('Practice Mode (Tiered 10-MCQ Batches)');
      expect(practiceInstruction).toContain('Reasoning-First Generation (FR-017)');
      expect(practiceInstruction).toContain('solutionExplanation');
      expect(practiceInstruction).toContain('correctOptionIndex');
    });

    it('builds context-specific operation prompts correctly', () => {
      const explainInitPrompt = buildExplainInitPrompt('Quantum Computing');
      expect(explainInitPrompt).toContain('Quantum Computing');
      expect(explainInitPrompt).toContain('4-card progressive sequence');

      const explainDeeperPrompt = buildExplainDeeperPrompt({
        topicQuery: 'Quantum Computing',
        parentCard: {
          stepType: 'core_mechanism',
          title: 'Superposition & Entanglement',
          contentMarkdown: 'Qubits can exist in superposition...',
          depthLevel: 1,
        },
      });
      expect(explainDeeperPrompt).toContain('Quantum Computing');
      expect(explainDeeperPrompt).toContain('Superposition & Entanglement');
      expect(explainDeeperPrompt).toContain('Depth Level: 2');

      const interactInitPrompt = buildInteractInitPrompt('Binary Search Trees');
      expect(interactInitPrompt).toContain('Binary Search Trees');
      expect(interactInitPrompt).toContain('3 to 5 sequential conceptual milestones');

      const interactTurnPrompt = buildInteractTurnPrompt({
        activeMilestone: 'Tree Invariant',
        strikeCount: 1,
        history: [{ role: 'user', content: 'Is left always smaller?' }],
        userMessage: 'Yes, left is smaller and right is larger.',
        isManualBypass: false,
      });
      expect(interactTurnPrompt).toContain('Tree Invariant');
      expect(interactTurnPrompt).toContain('Current Strike Count: 1');
      expect(interactTurnPrompt).toContain('Yes, left is smaller');
      expect(interactTurnPrompt).toContain('<<MENTORA_STATE');

      const practicePrompt = buildPracticeGeneratePrompt('Dynamic Programming', 'medium');
      expect(practicePrompt).toContain('Dynamic Programming');
      expect(practicePrompt).toContain('MEDIUM');
      expect(practicePrompt).toContain('REASONING-FIRST');
    });
  });

  describe('Gemini Client Wrapper (gemini.client.ts)', () => {
    beforeEach(() => {
      resetGeminiClient();
    });

    afterEach(() => {
      resetGeminiClient();
    });

    it('initializes cleanly without making live external API calls', () => {
      const client = getGeminiClient();
      expect(client).toBeInstanceOf(GoogleGenAI);
      expect(typeof client.models.generateContent).toBe('function');
    });

    it('returns a singleton instance on repeated calls', () => {
      const client1 = getGeminiClient();
      const client2 = getGeminiClient();
      expect(client1).toBe(client2);
    });

    it('allows dependency injection of a mock GoogleGenAI client for isolated testing', () => {
      const mockClient = {
        models: {
          generateContent: vi.fn(),
          generateContentStream: vi.fn(),
        },
      } as unknown as GoogleGenAI;

      setGeminiClient(mockClient);
      expect(getGeminiClient()).toBe(mockClient);
    });

    it('resets the singleton instance cleanly', () => {
      const client1 = getGeminiClient();
      resetGeminiClient();
      const client2 = getGeminiClient();
      expect(client1).not.toBe(client2);
    });

    it('allows creating a client with a custom API key via factory function', () => {
      const customClient = createGeminiClient('custom-key-12345');
      expect(customClient).toBeInstanceOf(GoogleGenAI);
    });
  });
});
