import { describe, it, expect, vi } from 'vitest';
import {
  EducationLevel,
  ExplanationStyle,
  LearningMode,
  PracticeTier,
  MCQ_BATCH_SIZE,
} from '@mentora/shared';
import { AiOperation } from '../ai/model.router.js';
import {
  DEFAULT_BENCHMARK_CASES,
  AI_EVAL_TARGET_THRESHOLD_PERCENT,
  verifyReasoningFirstOrdering,
  createSimulatedDryRunGenerator,
  runAiEvaluationSuite,
  type AiEvalCaseResult,
} from '../scripts/eval-ai.js';

describe('IMP-026: Standalone AI Evaluation Suite (eval:ai)', () => {
  describe('1. Benchmark Matrix Specification (architecture.md Section L.2)', () => {
    it('contains exactly 15 canonical benchmark test cases', () => {
      expect(DEFAULT_BENCHMARK_CASES).toHaveLength(15);
    });

    it('covers all three Education Levels across High School, Undergraduate, and Professional', () => {
      const levels = new Set(DEFAULT_BENCHMARK_CASES.map((c) => c.educationLevel));
      expect(levels.has(EducationLevel.HIGH_SCHOOL)).toBe(true);
      expect(levels.has(EducationLevel.UNDERGRADUATE)).toBe(true);
      expect(levels.has(EducationLevel.PROFESSIONAL)).toBe(true);

      const hsCases = DEFAULT_BENCHMARK_CASES.filter(
        (c) => c.educationLevel === EducationLevel.HIGH_SCHOOL
      );
      const ugCases = DEFAULT_BENCHMARK_CASES.filter(
        (c) => c.educationLevel === EducationLevel.UNDERGRADUATE
      );
      const proCases = DEFAULT_BENCHMARK_CASES.filter(
        (c) => c.educationLevel === EducationLevel.PROFESSIONAL
      );

      expect(hsCases).toHaveLength(5);
      expect(ugCases).toHaveLength(5);
      expect(proCases).toHaveLength(5);
    });

    it('covers all three Explanation Styles', () => {
      const styles = new Set(DEFAULT_BENCHMARK_CASES.map((c) => c.explanationStyle));
      expect(styles.has(ExplanationStyle.VISUAL)).toBe(true);
      expect(styles.has(ExplanationStyle.ANALOGY_HEAVY)).toBe(true);
      expect(styles.has(ExplanationStyle.CONCISE_TECHNICAL)).toBe(true);
    });

    it('covers all three core AI operations and Practice tiers', () => {
      const ops = new Set(DEFAULT_BENCHMARK_CASES.map((c) => c.operation));
      expect(ops.has(AiOperation.EXPLAIN_INIT)).toBe(true);
      expect(ops.has(AiOperation.INTERACT_INIT)).toBe(true);
      expect(ops.has(AiOperation.PRACTICE_GENERATE)).toBe(true);

      const practiceCases = DEFAULT_BENCHMARK_CASES.filter(
        (c) => c.operation === AiOperation.PRACTICE_GENERATE
      );
      const tiers = new Set(practiceCases.map((c) => c.tier));
      expect(tiers.has(PracticeTier.EASY)).toBe(true);
      expect(tiers.has(PracticeTier.MEDIUM)).toBe(true);
      expect(tiers.has(PracticeTier.HARD)).toBe(true);
    });

    it('has target threshold set to 99.0% per NFR-003 and Section 4.3', () => {
      expect(AI_EVAL_TARGET_THRESHOLD_PERCENT).toBe(99.0);
    });
  });

  describe('2. Reasoning-First MCQ Order Verification (FR-017, NFR-003)', () => {
    const buildValidQuestions = () =>
      Array.from({ length: MCQ_BATCH_SIZE }, (_, i) => {
        const q: Record<string, unknown> = {};
        q.questionNumber = i + 1;
        q.questionText = `Question ${i + 1}`;
        q.options = ['Choice 0', 'Choice 1', 'Choice 2', 'Choice 3'];
        q.hint = `Hint ${i + 1}`;
        // solutionExplanation placed BEFORE correctOptionIndex
        q.solutionExplanation = `Derivation for Q${i + 1} leads to choice ${i % 4}.`;
        q.correctOptionIndex = i % 4;
        return q;
      });

    it('passes when 10 questions have solutionExplanation strictly before correctOptionIndex', () => {
      const questions = buildValidQuestions();
      const rawText = JSON.stringify({ isEducationalValid: true, questions });

      const result = verifyReasoningFirstOrdering(rawText, questions);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when question count is not exactly 10', () => {
      const questions = buildValidQuestions().slice(0, 9);
      const rawText = JSON.stringify({ isEducationalValid: true, questions });

      const result = verifyReasoningFirstOrdering(rawText, questions);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/Expected exactly 10 questions, received 9/);
    });

    it('fails when a question does not have exactly 4 options', () => {
      const questions = buildValidQuestions();
      questions[2]!.options = ['Option A', 'Option B'];
      const rawText = JSON.stringify({ isEducationalValid: true, questions });

      const result = verifyReasoningFirstOrdering(rawText, questions);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Question 3'))).toBe(true);
    });

    it('fails when correctOptionIndex is out of bounds or not an integer', () => {
      const questions = buildValidQuestions();
      questions[0]!.correctOptionIndex = 5;
      const rawText = JSON.stringify({ isEducationalValid: true, questions });

      const result = verifyReasoningFirstOrdering(rawText, questions);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('integer between 0 and 3'))).toBe(true);
    });

    it('fails when solutionExplanation is empty or whitespace', () => {
      const questions = buildValidQuestions();
      questions[4]!.solutionExplanation = '   ';
      const rawText = JSON.stringify({ isEducationalValid: true, questions });

      const result = verifyReasoningFirstOrdering(rawText, questions);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('non-empty string'))).toBe(true);
    });

    it('fails when correctOptionIndex precedes solutionExplanation in object keys', () => {
      const questions = Array.from({ length: MCQ_BATCH_SIZE }, (_, i) => {
        const q: Record<string, unknown> = {};
        q.questionNumber = i + 1;
        q.questionText = `Question ${i + 1}`;
        q.options = ['A', 'B', 'C', 'D'];
        // Invert key order: correctOptionIndex added BEFORE solutionExplanation
        q.correctOptionIndex = i % 4;
        q.solutionExplanation = `Explanation ${i + 1}`;
        return q;
      });
      const rawText = JSON.stringify({ isEducationalValid: true, questions });

      const result = verifyReasoningFirstOrdering(rawText, questions);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('appeared BEFORE'))).toBe(true);
    });

    it('fails when raw JSON stream has correctOptionIndex before solutionExplanation', () => {
      const questions = buildValidQuestions();
      // Craft rawText where correctOptionIndex appears first in raw stream
      const rawText = JSON.stringify({
        isEducationalValid: true,
        questions: questions.map((q) => ({
          questionNumber: q.questionNumber,
          correctOptionIndex: q.correctOptionIndex,
          solutionExplanation: q.solutionExplanation,
          options: q.options,
        })),
      });

      const result = verifyReasoningFirstOrdering(rawText, questions);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Raw JSON stream property order'))).toBe(true);
    });
  });

  describe('3. Offline Dry-Run Evaluation (runAiEvaluationSuite)', () => {
    it('executes the full 15-case benchmark suite offline in dry-run mode with 100% first-pass pass rate', async () => {
      const progressCalls: AiEvalCaseResult[] = [];
      const report = await runAiEvaluationSuite({
        dryRun: true,
        onProgress: (result) => {
          progressCalls.push(result);
        },
      });

      expect(report.totalCases).toBe(15);
      expect(report.passedFirstPass).toBe(15);
      expect(report.failedFirstPass).toBe(0);
      expect(report.firstPassValidityRatePercent).toBe(100);
      expect(report.meetsTargetThreshold).toBe(true);
      expect(report.reasoningFirstOrderVerified).toBe(true);
      expect(report.failures).toHaveLength(0);
      expect(report.averageLatencyMs).toBeGreaterThan(0);
      expect(progressCalls).toHaveLength(15);
    });

    it('respects the limit option to evaluate a subset of cases', async () => {
      const report = await runAiEvaluationSuite({
        dryRun: true,
        limit: 3,
      });

      expect(report.totalCases).toBe(3);
      expect(report.passedFirstPass).toBe(3);
      expect(report.caseResults).toHaveLength(3);
    });

    it('filters cases by learning mode', async () => {
      const explainReport = await runAiEvaluationSuite({
        dryRun: true,
        mode: LearningMode.EXPLAIN,
      });

      expect(explainReport.totalCases).toBeGreaterThan(0);
      expect(
        explainReport.caseResults.every((c) => c.operation === AiOperation.EXPLAIN_INIT)
      ).toBe(true);

      const interactReport = await runAiEvaluationSuite({
        dryRun: true,
        mode: LearningMode.INTERACT,
      });

      expect(interactReport.totalCases).toBeGreaterThan(0);
      expect(
        interactReport.caseResults.every((c) => c.operation === AiOperation.INTERACT_INIT)
      ).toBe(true);

      const practiceReport = await runAiEvaluationSuite({
        dryRun: true,
        mode: LearningMode.PRACTICE,
      });

      expect(practiceReport.totalCases).toBeGreaterThan(0);
      expect(
        practiceReport.caseResults.every((c) => c.operation === AiOperation.PRACTICE_GENERATE)
      ).toBe(true);
      expect(practiceReport.reasoningFirstTotalChecked).toBe(practiceReport.totalCases);
      expect(practiceReport.reasoningFirstOrderVerified).toBe(true);
    });
  });

  describe('4. Failure Detection and Threshold Evaluation with Mocked Generator', () => {
    it('detects schema validation errors and reports failed cases when generator returns malformed payload', async () => {
      const failingGenerator = vi.fn().mockImplementation(async (opts) => {
        // Return valid for EXPLAIN, but return invalid schema for INTERACT
        if (opts.operation === AiOperation.INTERACT_INIT) {
          return {
            rawText: JSON.stringify({
              isEducationalValid: true,
              // Missing milestones and openingQuestion
            }),
            latencyMs: 10,
          };
        }
        return createSimulatedDryRunGenerator()(opts);
      });

      const report = await runAiEvaluationSuite({
        cases: [
          DEFAULT_BENCHMARK_CASES[0]!, // EXPLAIN_INIT (passes)
          DEFAULT_BENCHMARK_CASES[1]!, // INTERACT_INIT (fails)
        ],
        generator: failingGenerator,
      });

      expect(report.totalCases).toBe(2);
      expect(report.passedFirstPass).toBe(1);
      expect(report.failedFirstPass).toBe(1);
      expect(report.firstPassValidityRatePercent).toBe(50);
      expect(report.meetsTargetThreshold).toBe(false);
      expect(report.failures).toHaveLength(1);
      expect(report.failures[0]!.id).toBe('hs-phys-02');
      expect(report.failures[0]!.errors.some((e) => e.includes('Schema validation failed'))).toBe(
        true
      );
    });

    it('detects non-JSON output and records syntax error', async () => {
      const nonJsonGenerator = vi.fn().mockResolvedValue({
        rawText: 'Sorry, I am not able to process this request.',
        latencyMs: 15,
      });

      const report = await runAiEvaluationSuite({
        cases: [DEFAULT_BENCHMARK_CASES[0]!],
        generator: nonJsonGenerator,
      });

      expect(report.totalCases).toBe(1);
      expect(report.passedFirstPass).toBe(0);
      expect(report.failedFirstPass).toBe(1);
      expect(report.firstPassValidityRatePercent).toBe(0);
      expect(report.failures[0]!.errors[0]).toMatch(/Invalid JSON response:/);
    });

    it('detects Reasoning-First key inversion in Practice generation and fails reasoning check', async () => {
      const invertedMcqGenerator = vi.fn().mockImplementation(async (opts) => {
        if (opts.operation === AiOperation.PRACTICE_GENERATE) {
          const questions = Array.from({ length: MCQ_BATCH_SIZE }, (_, i) => ({
            questionNumber: i + 1,
            questionText: `Question ${i + 1}`,
            options: ['A', 'B', 'C', 'D'],
            hint: 'Hint',
            // INVERTED: correctOptionIndex before solutionExplanation
            correctOptionIndex: 0,
            solutionExplanation: 'Explanation',
          }));
          return {
            rawText: JSON.stringify({
              isEducationalValid: true,
              normalizedTitle: 'Topic',
              questions,
            }),
            latencyMs: 20,
          };
        }
        return createSimulatedDryRunGenerator()(opts);
      });

      const practiceCase = DEFAULT_BENCHMARK_CASES.find(
        (c) => c.operation === AiOperation.PRACTICE_GENERATE
      )!;

      const report = await runAiEvaluationSuite({
        cases: [practiceCase],
        generator: invertedMcqGenerator,
      });

      expect(report.totalCases).toBe(1);
      expect(report.passedFirstPass).toBe(0);
      expect(report.failedFirstPass).toBe(1);
      expect(report.reasoningFirstOrderVerified).toBe(false);
      expect(report.failures[0]!.errors.some((e) => e.includes('Reasoning-First requirement'))).toBe(
        true
      );
    });
  });

  describe('5. Live Mode Guards', () => {
    it('throws a descriptive error when invoked in live mode without a valid GEMINI_API_KEY', async () => {
      await expect(
        runAiEvaluationSuite({
          dryRun: false,
          apiKey: '',
        })
      ).rejects.toThrow(/GEMINI_API_KEY is not configured/);
    });
  });
});
