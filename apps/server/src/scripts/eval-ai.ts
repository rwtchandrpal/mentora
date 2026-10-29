import './env-preload.js';
import {
  EducationLevel,
  ExplanationStyle,
  LearningMode,
  PracticeTier,
  ExplainStepType,
  ExplainInitOutputSchema,
  InteractInitOutputSchema,
  PracticeBatchGenerationSchema,
  MCQ_BATCH_SIZE,
  type ExplainInitOutputDTO,
  type InteractInitOutputDTO,
  type StaticLearnerProfile,
} from '@mentora/shared';
import { env } from '../config/env.js';
import { PromptBuilder } from '../ai/prompts/prompt.builder.js';
import {
  AiOperation,
  resolveModelForOperation,
} from '../ai/model.router.js';
import { explainInitGeminiSchema } from '../ai/schemas/explain.gemini-schema.js';
import { interactInitGeminiSchema } from '../ai/schemas/interact.gemini-schema.js';
import { practiceBatchGeminiSchema } from '../ai/schemas/practice.gemini-schema.js';
import { getGeminiClient } from '../ai/gemini.client.js';
import type { Schema } from '@google/genai';

export const AI_EVAL_TARGET_THRESHOLD_PERCENT = 99.0;

export interface BenchmarkTestCase {
  id: string;
  topic: string;
  educationLevel: EducationLevel;
  explanationStyle: ExplanationStyle;
  operation: AiOperation;
  tier?: PracticeTier;
}

/**
 * 15 canonical benchmark topics spanning High School, Undergraduate, and Professional domains
 * mapped across all 3 Education Levels and all 3 Explanation Styles (architecture.md Section L.2).
 */
export const DEFAULT_BENCHMARK_CASES: BenchmarkTestCase[] = [
  // High School Domain (Biology, Physics, Chemistry, Math, Environmental Science)
  {
    id: 'hs-bio-01',
    topic: 'Photosynthesis: Light-Dependent and Light-Independent Reactions',
    educationLevel: EducationLevel.HIGH_SCHOOL,
    explanationStyle: ExplanationStyle.VISUAL,
    operation: AiOperation.EXPLAIN_INIT,
  },
  {
    id: 'hs-phys-02',
    topic: "Newton's Three Laws of Motion and Friction Mechanics",
    educationLevel: EducationLevel.HIGH_SCHOOL,
    explanationStyle: ExplanationStyle.ANALOGY_HEAVY,
    operation: AiOperation.INTERACT_INIT,
  },
  {
    id: 'hs-chem-03',
    topic: 'Periodic Table Trends and Electronegativity',
    educationLevel: EducationLevel.HIGH_SCHOOL,
    explanationStyle: ExplanationStyle.CONCISE_TECHNICAL,
    operation: AiOperation.PRACTICE_GENERATE,
    tier: PracticeTier.EASY,
  },
  {
    id: 'hs-math-04',
    topic: 'Quadratic Equations and Vertex Form Derivation',
    educationLevel: EducationLevel.HIGH_SCHOOL,
    explanationStyle: ExplanationStyle.VISUAL,
    operation: AiOperation.PRACTICE_GENERATE,
    tier: PracticeTier.MEDIUM,
  },
  {
    id: 'hs-env-05',
    topic: 'Carbon Cycle and Global Greenhouse Dynamics',
    educationLevel: EducationLevel.HIGH_SCHOOL,
    explanationStyle: ExplanationStyle.ANALOGY_HEAVY,
    operation: AiOperation.EXPLAIN_INIT,
  },

  // Undergraduate Domain (Operating Systems, Algorithms, Networks, Databases, Linear Algebra)
  {
    id: 'ug-os-06',
    topic: 'Operating System Deadlocks and Coffman Conditions',
    educationLevel: EducationLevel.UNDERGRADUATE,
    explanationStyle: ExplanationStyle.CONCISE_TECHNICAL,
    operation: AiOperation.EXPLAIN_INIT,
  },
  {
    id: 'ug-algo-07',
    topic: 'Binary Search Trees and AVL Self-Balancing Rotations',
    educationLevel: EducationLevel.UNDERGRADUATE,
    explanationStyle: ExplanationStyle.VISUAL,
    operation: AiOperation.PRACTICE_GENERATE,
    tier: PracticeTier.EASY,
  },
  {
    id: 'ug-net-08',
    topic: 'TCP Three-Way Handshake and Sliding Window Congestion Control',
    educationLevel: EducationLevel.UNDERGRADUATE,
    explanationStyle: ExplanationStyle.ANALOGY_HEAVY,
    operation: AiOperation.INTERACT_INIT,
  },
  {
    id: 'ug-db-09',
    topic: 'Relational Database Normalization: 1NF to BCNF',
    educationLevel: EducationLevel.UNDERGRADUATE,
    explanationStyle: ExplanationStyle.CONCISE_TECHNICAL,
    operation: AiOperation.PRACTICE_GENERATE,
    tier: PracticeTier.MEDIUM,
  },
  {
    id: 'ug-math-10',
    topic: 'Linear Algebra: Eigenvalues and Diagonalization',
    educationLevel: EducationLevel.UNDERGRADUATE,
    explanationStyle: ExplanationStyle.VISUAL,
    operation: AiOperation.EXPLAIN_INIT,
  },

  // Professional Domain (Distributed Systems, System Design, Security, Cloud Architecture)
  {
    id: 'pro-dist-11',
    topic: 'Distributed Consensus via Raft Protocol: Leader Election & Log Replication',
    educationLevel: EducationLevel.PROFESSIONAL,
    explanationStyle: ExplanationStyle.CONCISE_TECHNICAL,
    operation: AiOperation.EXPLAIN_INIT,
  },
  {
    id: 'pro-arch-12',
    topic: 'CAP Theorem and PACELC Trade-offs in Distributed Data Stores',
    educationLevel: EducationLevel.PROFESSIONAL,
    explanationStyle: ExplanationStyle.VISUAL,
    operation: AiOperation.INTERACT_INIT,
  },
  {
    id: 'pro-sys-13',
    topic: 'Distributed Rate Limiting via Redis Token Bucket and Sliding Window Log',
    educationLevel: EducationLevel.PROFESSIONAL,
    explanationStyle: ExplanationStyle.ANALOGY_HEAVY,
    operation: AiOperation.PRACTICE_GENERATE,
    tier: PracticeTier.HARD,
  },
  {
    id: 'pro-sec-14',
    topic: 'Zero-Trust Architecture: Mutual TLS (mTLS) and SPIFFE/SPIRE Identity',
    educationLevel: EducationLevel.PROFESSIONAL,
    explanationStyle: ExplanationStyle.CONCISE_TECHNICAL,
    operation: AiOperation.PRACTICE_GENERATE,
    tier: PracticeTier.HARD,
  },
  {
    id: 'pro-db-15',
    topic: 'Log-Structured Merge-Trees (LSM) vs B-Trees in Modern Storage Engines',
    educationLevel: EducationLevel.PROFESSIONAL,
    explanationStyle: ExplanationStyle.VISUAL,
    operation: AiOperation.EXPLAIN_INIT,
  },
];

export interface AiEvalGeneratorOptions {
  operation: AiOperation;
  systemInstruction: string;
  prompt: string;
  responseSchema: Schema | Record<string, unknown>;
  model: string;
}

export type AiEvalGeneratorFn = (options: AiEvalGeneratorOptions) => Promise<{
  rawText: string;
  latencyMs: number;
}>;

export interface McqReasoningFirstValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validates Reasoning-First MCQ generation property ordering and structure (FR-017, NFR-003).
 * Verifies:
 * 1. questions.length === 10
 * 2. Every question has exactly 4 options
 * 3. 0 <= correctOptionIndex <= 3
 * 4. solutionExplanation is a non-empty string
 * 5. In both parsed object key enumeration and raw JSON text stream,
 *    solutionExplanation strictly precedes correctOptionIndex.
 */
export const verifyReasoningFirstOrdering = (
  rawText: string,
  parsedQuestions: Array<Record<string, unknown>>
): McqReasoningFirstValidation => {
  const errors: string[] = [];

  if (!Array.isArray(parsedQuestions) || parsedQuestions.length !== MCQ_BATCH_SIZE) {
    errors.push(
      `Expected exactly ${MCQ_BATCH_SIZE} questions, received ${parsedQuestions?.length ?? 0}`
    );
    return { valid: false, errors };
  }

  for (let i = 0; i < parsedQuestions.length; i++) {
    const q = parsedQuestions[i];
    if (!q) {
      errors.push(`Question ${i + 1} is undefined.`);
      continue;
    }

    const keys = Object.keys(q);
    const explKeyIdx = keys.indexOf('solutionExplanation');
    const ansKeyIdx = keys.indexOf('correctOptionIndex');

    if (explKeyIdx === -1) {
      errors.push(`Question ${i + 1}: Missing 'solutionExplanation' property.`);
    }
    if (ansKeyIdx === -1) {
      errors.push(`Question ${i + 1}: Missing 'correctOptionIndex' property.`);
    }
    if (explKeyIdx !== -1 && ansKeyIdx !== -1 && explKeyIdx > ansKeyIdx) {
      errors.push(
        `Question ${i + 1}: 'correctOptionIndex' (key index ${ansKeyIdx}) appeared BEFORE 'solutionExplanation' (key index ${explKeyIdx}), violating FR-017 Reasoning-First requirement.`
      );
    }

    if (
      typeof q.solutionExplanation !== 'string' ||
      q.solutionExplanation.trim().length === 0
    ) {
      errors.push(`Question ${i + 1}: 'solutionExplanation' must be a non-empty string.`);
    }

    if (!Array.isArray(q.options) || q.options.length !== 4) {
      errors.push(`Question ${i + 1}: 'options' must be an array of exactly 4 choices.`);
    }

    if (
      typeof q.correctOptionIndex !== 'number' ||
      !Number.isInteger(q.correctOptionIndex) ||
      q.correctOptionIndex < 0 ||
      q.correctOptionIndex > 3
    ) {
      errors.push(
        `Question ${i + 1}: 'correctOptionIndex' must be an integer between 0 and 3.`
      );
    }
  }

  // Raw text stream property ordering check: verify solutionExplanation appears before correctOptionIndex
  const propMatches = [
    ...rawText.matchAll(/"(solutionExplanation|correctOptionIndex)"\s*:/g),
  ];
  if (propMatches.length >= MCQ_BATCH_SIZE * 2) {
    for (let i = 0; i < MCQ_BATCH_SIZE; i++) {
      const match1 = propMatches[i * 2];
      const match2 = propMatches[i * 2 + 1];
      if (match1 && match2) {
        if (
          match1[1] !== 'solutionExplanation' ||
          match2[1] !== 'correctOptionIndex'
        ) {
          errors.push(
            `Question ${i + 1}: Raw JSON stream property order was "${match1[1]}" followed by "${match2[1]}", expected "solutionExplanation" before "correctOptionIndex".`
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Built-in deterministic simulated generator for offline dry-run evaluations.
 */
export const createSimulatedDryRunGenerator = (): AiEvalGeneratorFn => {
  return async (options: AiEvalGeneratorOptions) => {
    const start = Date.now();
    let payload: unknown;

    if (options.operation === AiOperation.EXPLAIN_INIT) {
      const explainPayload: ExplainInitOutputDTO = {
        isEducationalValid: true,
        normalizedTitle: 'Simulated Benchmark Topic',
        cards: [
          {
            stepNumber: 1,
            stepType: ExplainStepType.INTUITION,
            title: 'Intuitive Foundation',
            contentMarkdown:
              'Imagine a balance scale representing physical equilibrium in real time.',
            checkQuestion: null,
            checkAnswer: null,
            deepDives: [],
          },
          {
            stepNumber: 2,
            stepType: ExplainStepType.CORE_MECHANISM,
            title: 'Core Mathematical Invariants',
            contentMarkdown:
              'The invariant holds if $\\sum_{i=1}^n F_i = 0$ and $\\tau_{net} = 0$.',
            checkQuestion: null,
            checkAnswer: null,
            deepDives: [],
          },
          {
            stepNumber: 3,
            stepType: ExplainStepType.EXAMPLE,
            title: 'Applied Simulation Scenario',
            contentMarkdown:
              '```typescript\nfunction verifyEquilibrium(forces: number[]): boolean {\n  return forces.reduce((a, b) => a + b, 0) === 0;\n}\n```',
            checkQuestion: null,
            checkAnswer: null,
            deepDives: [],
          },
          {
            stepNumber: 4,
            stepType: ExplainStepType.CHECK_FOR_UNDERSTANDING,
            title: 'Check for Understanding',
            contentMarkdown:
              'Reflect on how external perturbation impacts system stability.',
            checkQuestion:
              'If net force is zero but torque is non-zero, does equilibrium hold?',
            checkAnswer:
              'No, rotational acceleration will occur since rotational equilibrium requires zero net torque.',
            deepDives: [],
          },
        ],
        suggestedSubTopics: [
          'Rotational Inertia',
          'Static vs Dynamic Equilibrium',
        ],
      };
      payload = explainPayload;
    } else if (options.operation === AiOperation.INTERACT_INIT) {
      const interactPayload: InteractInitOutputDTO = {
        isEducationalValid: true,
        normalizedTitle: 'Simulated Benchmark Topic',
        milestones: [
          {
            milestoneNumber: 1,
            title: 'Foundational Diagnostics',
            description: 'Understand basic system inputs and preconditions.',
          },
          {
            milestoneNumber: 2,
            title: 'Mechanistic Analysis',
            description: 'Trace causal chains and invariant state transitions.',
          },
          {
            milestoneNumber: 3,
            title: 'Synthesis & Trade-offs',
            description: 'Evaluate failure modes and optimization trade-offs.',
          },
        ],
        openingQuestion:
          'When observing system degradation under load, which diagnostic signal should be examined first?',
      };
      payload = interactPayload;
    } else {
      // Practice Batch: Build object with explicit property order (solutionExplanation BEFORE correctOptionIndex)
      const questions = Array.from({ length: MCQ_BATCH_SIZE }, (_, i) => {
        const q: Record<string, unknown> = {};
        q.questionNumber = i + 1;
        q.questionText = `Question ${i + 1}: What is the primary characteristic of operation ${i + 1}?`;
        q.options = [
          'Option A: Logarithmic Complexity',
          'Option B: Linear Complexity',
          'Option C: Quadratic Complexity',
          'Option D: Constant Complexity',
        ];
        q.hint = `Consider the divide-and-conquer branching factor for question ${i + 1}.`;
        // Reasoning-First: solutionExplanation added before correctOptionIndex
        q.solutionExplanation = `REASONING: By partitioning the input space by 2 at each step, derivation yields Option ${i % 4}.`;
        q.correctOptionIndex = i % 4;
        return q;
      });

      payload = {
        isEducationalValid: true,
        normalizedTitle: 'Simulated Benchmark Topic',
        questions,
      };
    }

    const latencyMs = Math.max(5, Date.now() - start);
    return {
      rawText: JSON.stringify(payload),
      latencyMs,
    };
  };
};

export interface AiEvalCaseResult {
  id: string;
  topic: string;
  educationLevel: EducationLevel;
  explanationStyle: ExplanationStyle;
  operation: AiOperation;
  model: string;
  latencyMs: number;
  firstPassValid: boolean;
  reasoningFirstOrderValid: boolean;
  errors: string[];
}

export interface AiEvalSummaryReport {
  totalCases: number;
  passedFirstPass: number;
  failedFirstPass: number;
  firstPassValidityRatePercent: number;
  targetThresholdPercent: number;
  meetsTargetThreshold: boolean;
  reasoningFirstTotalChecked: number;
  reasoningFirstPassed: number;
  reasoningFirstOrderVerified: boolean;
  averageLatencyMs: number;
  caseResults: AiEvalCaseResult[];
  failures: Array<{
    id: string;
    topic: string;
    operation: AiOperation;
    errors: string[];
  }>;
}

export interface AiEvaluationOptions {
  cases?: BenchmarkTestCase[];
  limit?: number;
  mode?: LearningMode;
  dryRun?: boolean;
  generator?: AiEvalGeneratorFn;
  apiKey?: string;
  fastModel?: string;
  reasoningModel?: string;
  onProgress?: (result: AiEvalCaseResult, index: number, total: number) => void;
}

/**
 * Runs the Standalone AI Quality & Reliability Evaluation Suite (IMP-026).
 * Benchmarks first-pass Zod schema validity and Reasoning-First MCQ key order.
 */
export const runAiEvaluationSuite = async (
  options: AiEvaluationOptions = {}
): Promise<AiEvalSummaryReport> => {
  let targetCases = [...(options.cases ?? DEFAULT_BENCHMARK_CASES)];

  // Filter by learning mode if specified
  if (options.mode) {
    targetCases = targetCases.filter((c) => {
      if (options.mode === LearningMode.EXPLAIN) {
        return c.operation === AiOperation.EXPLAIN_INIT;
      }
      if (options.mode === LearningMode.INTERACT) {
        return c.operation === AiOperation.INTERACT_INIT;
      }
      if (options.mode === LearningMode.PRACTICE) {
        return c.operation === AiOperation.PRACTICE_GENERATE;
      }
      return true;
    });
  }

  // Apply case limit if specified
  if (typeof options.limit === 'number' && options.limit > 0) {
    targetCases = targetCases.slice(0, options.limit);
  }

  const isDryRun = options.dryRun ?? false;

  // Resolve generator function: custom generator > dry-run simulator > live Gemini SDK
  let generator: AiEvalGeneratorFn;

  if (options.generator) {
    generator = options.generator;
  } else if (isDryRun) {
    generator = createSimulatedDryRunGenerator();
  } else {
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'test-gemini-api-key') {
      throw new Error(
        'GEMINI_API_KEY is not configured. Pass a valid API key, set GEMINI_API_KEY in environment, or run with --dry-run for offline verification.'
      );
    }

    generator = async (genOpts: AiEvalGeneratorOptions) => {
      const client = getGeminiClient();
      const startTime = Date.now();
      const response = await client.models.generateContent({
        model: genOpts.model,
        contents: genOpts.prompt,
        config: {
          systemInstruction: genOpts.systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: genOpts.responseSchema as Schema,
        },
      });
      const latencyMs = Date.now() - startTime;
      const rawText = response.text ?? '';
      return { rawText, latencyMs };
    };
  }

  const caseResults: AiEvalCaseResult[] = [];
  let passedCount = 0;
  let reasoningFirstTotal = 0;
  let reasoningFirstPassed = 0;
  let totalLatency = 0;

  for (let i = 0; i < targetCases.length; i++) {
    const testCase = targetCases[i];
    if (!testCase) continue;

    const profile: StaticLearnerProfile = {
      educationLevel: testCase.educationLevel,
      preferredStyle: testCase.explanationStyle,
    };

    let learningMode: LearningMode = LearningMode.EXPLAIN;
    let responseSchema: Schema | Record<string, unknown> = explainInitGeminiSchema;
    let prompt = PromptBuilder.buildExplainInitPrompt(testCase.topic);

    if (testCase.operation === AiOperation.INTERACT_INIT) {
      learningMode = LearningMode.INTERACT;
      responseSchema = interactInitGeminiSchema;
      prompt = PromptBuilder.buildInteractInitPrompt(testCase.topic);
    } else if (testCase.operation === AiOperation.PRACTICE_GENERATE) {
      learningMode = LearningMode.PRACTICE;
      responseSchema = practiceBatchGeminiSchema;
      prompt = PromptBuilder.buildPracticeGeneratePrompt(
        testCase.topic,
        testCase.tier ?? PracticeTier.EASY
      );
    }

    const systemInstruction = PromptBuilder.buildSystemInstruction(
      profile,
      learningMode
    );
    const model = resolveModelForOperation(testCase.operation, {
      fastModel: options.fastModel,
      reasoningModel: options.reasoningModel,
    });

    const caseErrors: string[] = [];
    let latencyMs = 0;
    let firstPassValid = false;
    let reasoningFirstOrderValid = true;

    try {
      const genOutput = await generator({
        operation: testCase.operation,
        systemInstruction,
        prompt,
        responseSchema,
        model,
      });

      latencyMs = genOutput.latencyMs;
      totalLatency += latencyMs;
      const rawText = genOutput.rawText;

      if (!rawText || rawText.trim().length === 0) {
        throw new Error('Received empty text response from generator.');
      }

      // Step 1: Parse raw text as JSON
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch (jsonErr) {
        throw new Error(
          `Invalid JSON response: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`,
          { cause: jsonErr }
        );
      }

      // Step 2: Validate against respective Zod schema (FIRST-PASS ONLY, NO RETRY)
      if (testCase.operation === AiOperation.EXPLAIN_INIT) {
        const result = ExplainInitOutputSchema.safeParse(parsedJson);
        if (!result.success) {
          throw new Error(
            `ExplainInitOutputSchema validation failed: ${result.error.issues.map((e) => e.message).join(', ')}`
          );
        }
      } else if (testCase.operation === AiOperation.INTERACT_INIT) {
        const result = InteractInitOutputSchema.safeParse(parsedJson);
        if (!result.success) {
          throw new Error(
            `InteractInitOutputSchema validation failed: ${result.error.issues.map((e) => e.message).join(', ')}`
          );
        }
      } else if (testCase.operation === AiOperation.PRACTICE_GENERATE) {
        const result = PracticeBatchGenerationSchema.safeParse(parsedJson);
        if (!result.success) {
          throw new Error(
            `PracticeBatchGenerationSchema validation failed: ${result.error.issues.map((e) => e.message).join(', ')}`
          );
        }

        // Step 3: Verify Reasoning-First Property Ordering on MCQs (FR-017, NFR-003)
        reasoningFirstTotal++;
        const questionsRecord = (parsedJson as { questions?: Array<Record<string, unknown>> })
          .questions ?? [];
        const rfValidation = verifyReasoningFirstOrdering(rawText, questionsRecord);

        if (!rfValidation.valid) {
          reasoningFirstOrderValid = false;
          caseErrors.push(...rfValidation.errors);
        } else {
          reasoningFirstPassed++;
        }
      }

      if (caseErrors.length === 0) {
        firstPassValid = true;
        passedCount++;
      }
    } catch (err) {
      firstPassValid = false;
      caseErrors.push(err instanceof Error ? err.message : String(err));
    }

    const caseResult: AiEvalCaseResult = {
      id: testCase.id,
      topic: testCase.topic,
      educationLevel: testCase.educationLevel,
      explanationStyle: testCase.explanationStyle,
      operation: testCase.operation,
      model,
      latencyMs,
      firstPassValid,
      reasoningFirstOrderValid,
      errors: caseErrors,
    };

    caseResults.push(caseResult);
    if (options.onProgress) {
      options.onProgress(caseResult, i + 1, targetCases.length);
    }
  }

  const totalCases = targetCases.length;
  const failedFirstPass = totalCases - passedCount;
  const firstPassValidityRatePercent =
    totalCases > 0 ? Number(((passedCount / totalCases) * 100).toFixed(1)) : 0;
  const meetsTargetThreshold =
    firstPassValidityRatePercent >= AI_EVAL_TARGET_THRESHOLD_PERCENT;
  const reasoningFirstOrderVerified =
    reasoningFirstTotal === 0 || reasoningFirstPassed === reasoningFirstTotal;
  const averageLatencyMs =
    totalCases > 0 ? Math.round(totalLatency / totalCases) : 0;

  const failures = caseResults
    .filter((r) => !r.firstPassValid || !r.reasoningFirstOrderValid)
    .map((r) => ({
      id: r.id,
      topic: r.topic,
      operation: r.operation,
      errors: r.errors,
    }));

  return {
    totalCases,
    passedFirstPass: passedCount,
    failedFirstPass,
    firstPassValidityRatePercent,
    targetThresholdPercent: AI_EVAL_TARGET_THRESHOLD_PERCENT,
    meetsTargetThreshold,
    reasoningFirstTotalChecked: reasoningFirstTotal,
    reasoningFirstPassed,
    reasoningFirstOrderVerified,
    averageLatencyMs,
    caseResults,
    failures,
  };
};

/**
 * Formats and prints a structured evaluation report to console.
 */
export const formatEvaluationReport = (
  report: AiEvalSummaryReport,
  modeDescription: string
): string => {
  const lines: string[] = [];
  lines.push('='.repeat(80));
  lines.push('  MENTORA STANDALONE AI EVALUATION SUITE REPORT (IMP-026)');
  lines.push(`  Target: First-Pass Validity >= ${report.targetThresholdPercent}% (NFR-003, Section 4.3)`);
  lines.push('='.repeat(80));
  lines.push(`Execution Mode: ${modeDescription}`);
  lines.push(`Total Benchmark Cases Evaluated: ${report.totalCases}`);
  lines.push('-'.repeat(80));

  report.caseResults.forEach((c, idx) => {
    const status = c.firstPassValid && c.reasoningFirstOrderValid ? 'PASS' : 'FAIL';
    const tag = `[${String(idx + 1).padStart(2, ' ')}/${report.totalCases}] ${status}`;
    const op = c.operation.padEnd(18, ' ');
    const lvl = c.educationLevel.padEnd(13, ' ');
    const sty = c.explanationStyle.padEnd(17, ' ');
    const time = `${c.latencyMs}ms`;
    lines.push(`${tag} | ${op} | ${lvl} | ${sty} | ${c.topic.slice(0, 32)} (${time})`);
    if (c.errors.length > 0) {
      c.errors.forEach((err) => lines.push(`     -> ERROR: ${err}`));
    }
  });

  lines.push('-'.repeat(80));
  lines.push('METRICS & COMPLIANCE SUMMARY:');
  lines.push(
    `- First-Pass Schema Validity Rate: ${report.firstPassValidityRatePercent}% (${report.passedFirstPass}/${report.totalCases} passed)`
  );
  lines.push(
    `- Target Threshold Required:       >= ${report.targetThresholdPercent}% -> [${report.meetsTargetThreshold ? 'PASSED' : 'FAILED'}]`
  );
  lines.push(
    `- Reasoning-First Property Order:  ${report.reasoningFirstPassed}/${report.reasoningFirstTotalChecked} verified (solutionExplanation before correctOptionIndex, FR-017)`
  );
  lines.push(
    `- Average First-Pass Latency:      ${report.averageLatencyMs}ms`
  );
  lines.push('='.repeat(80));

  return lines.join('\n');
};

/**
 * CLI Runner Entrypoint.
 */
export const cliMain = async (argv: string[] = process.argv.slice(2)): Promise<number> => {
  const isDryRun = argv.includes('--dry-run');
  const showHelp = argv.includes('--help') || argv.includes('-h');

  if (showHelp) {
    console.log(`
Mentora Standalone AI Quality & Reliability Evaluation Suite (IMP-026)

Usage:
  pnpm eval:ai [options]

Options:
  --dry-run             Run offline with deterministic simulated responses (no Gemini API calls)
  --limit <n>, -l <n>   Evaluate only the first <n> benchmark cases
  --mode <m>, -m <m>    Filter evaluation to a specific mode: explain | interact | practice
  --help, -h            Show this help message

Examples:
  pnpm eval:ai -- --dry-run
  pnpm eval:ai -- --dry-run --limit 3
  pnpm eval:ai -- --limit 5
`);
    return 0;
  }

  let limit: number | undefined;
  const limitIdx = argv.findIndex((arg) => arg === '--limit' || arg === '-l');
  if (limitIdx !== -1 && argv[limitIdx + 1]) {
    limit = parseInt(argv[limitIdx + 1]!, 10);
  }

  let mode: LearningMode | undefined;
  const modeIdx = argv.findIndex((arg) => arg === '--mode' || arg === '-m');
  if (modeIdx !== -1 && argv[modeIdx + 1]) {
    const rawMode = argv[modeIdx + 1]!.toLowerCase();
    if (rawMode === 'explain') mode = LearningMode.EXPLAIN;
    else if (rawMode === 'interact') mode = LearningMode.INTERACT;
    else if (rawMode === 'practice') mode = LearningMode.PRACTICE;
  }

  const apiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;

  if (!isDryRun && (!apiKey || apiKey === 'test-gemini-api-key')) {
    console.error(`
[Mentora AI Evaluation Suite]
Error: GEMINI_API_KEY is not configured in your environment.
To benchmark live Gemini models, export GEMINI_API_KEY with a valid Google AI Studio key:
  GEMINI_API_KEY=your_key pnpm eval:ai

Or run the offline dry-run evaluation suite:
  pnpm eval:ai -- --dry-run
`);
    return 1;
  }

  const modeDesc = isDryRun
    ? 'Dry-Run (Offline Simulated Responses)'
    : `Live Models (Fast: ${env.GEMINI_FAST_MODEL}, Reasoning: ${env.GEMINI_REASONING_MODEL})`;

  console.log(`\nInitializing Mentora AI Evaluation Suite (${modeDesc})...\n`);

  try {
    const report = await runAiEvaluationSuite({
      dryRun: isDryRun,
      limit,
      mode,
      onProgress: (result, index, total) => {
        const symbol = result.firstPassValid && result.reasoningFirstOrderValid ? '✓' : '✗';
        console.log(
          `[${index}/${total}] ${symbol} ${result.operation} | ${result.educationLevel} | ${result.topic.slice(0, 36)} (${result.latencyMs}ms)`
        );
      },
    });

    console.log('\n' + formatEvaluationReport(report, modeDesc) + '\n');

    return report.meetsTargetThreshold && report.reasoningFirstOrderVerified ? 0 : 1;
  } catch (err) {
    console.error(
      `\nEvaluation runner encountered a fatal error: ${err instanceof Error ? err.message : String(err)}\n`
    );
    return 1;
  }
};

// Guard CLI execution so importing eval-ai.ts in tests does not run the CLI runner
const isDirectExecution = (): boolean => {
  if (typeof process === 'undefined' || !process.argv || !process.argv[1]) return false;
  const scriptPath = process.argv[1].replace(/\\/g, '/');
  return scriptPath.endsWith('eval-ai.ts') || scriptPath.endsWith('eval-ai.js');
};

if (isDirectExecution()) {
  cliMain().then((code) => {
    process.exit(code);
  });
}
