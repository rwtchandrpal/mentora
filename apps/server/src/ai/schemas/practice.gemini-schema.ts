import { Type, type Schema } from '@google/genai';

/**
 * Explicit key order for Practice Mode MCQ questions.
 * Mandates Reasoning-First generation where solutionExplanation strictly precedes correctOptionIndex (FR-017).
 */
export const PRACTICE_MCQ_GEMINI_PROPERTY_ORDER = [
  'questionNumber',
  'questionText',
  'options',
  'hint',
  'solutionExplanation',
  'correctOptionIndex',
] as const;

/**
 * Gemini responseSchema for a single Practice MCQ Question.
 * Enforces FR-017 (Reasoning-First ordering): derivation before answer selection.
 */
export const practiceQuestionGeminiSchema: Schema = {
  type: Type.OBJECT,
  description: 'Single multiple-choice question with derivation-first verification.',
  properties: {
    questionNumber: {
      type: Type.INTEGER,
      description: 'Sequential question number from 1 to 10.',
    },
    questionText: {
      type: Type.STRING,
      description: 'Rigorous question stem formatted in Markdown, supporting inline LaTeX $...$ and block $$...$$.',
    },
    options: {
      type: Type.ARRAY,
      description: 'Exactly 4 distinct plausible options [A, B, C, D].',
      items: {
        type: Type.STRING,
      },
    },
    hint: {
      type: Type.STRING,
      description: 'Helpful conceptual clue that nudges the learner without giving away the answer.',
    },
    solutionExplanation: {
      type: Type.STRING,
      description: 'REASONING-FIRST: Comprehensive step-by-step mathematical/conceptual derivation derived BEFORE locking the correct answer index.',
    },
    correctOptionIndex: {
      type: Type.INTEGER,
      description: 'Zero-based index (0, 1, 2, or 3) of the correct option, strictly matching the solutionExplanation derived above.',
    },
  },
  propertyOrdering: [...PRACTICE_MCQ_GEMINI_PROPERTY_ORDER],
  required: [
    'questionNumber',
    'questionText',
    'options',
    'hint',
    'solutionExplanation',
    'correctOptionIndex',
  ],
};

/**
 * Gemini responseSchema for Practice Mode 10-MCQ Batch Generation.
 * Aligns with @mentora/shared PracticeBatchGenerationSchema.
 */
export const practiceBatchGeminiSchema: Schema = {
  type: Type.OBJECT,
  description: 'Practice Mode 10-MCQ batch with Reasoning-First derivation or educational refusal notice.',
  properties: {
    isEducationalValid: {
      type: Type.BOOLEAN,
      description: 'True if the request is a valid academic or skill-building educational topic; false if harmful, unethical, or non-educational.',
    },
    refusalReason: {
      type: Type.STRING,
      description: 'Polite educational refusal explanation directing the user to enter a valid academic/technical topic. Required when isEducationalValid is false.',
      nullable: true,
    },
    normalizedTitle: {
      type: Type.STRING,
      description: 'Clean, professional display title for the educational topic.',
    },
    questions: {
      type: Type.ARRAY,
      description: 'Exactly 10 multiple-choice questions calibrated to the requested difficulty tier.',
      items: practiceQuestionGeminiSchema,
    },
  },
  required: ['isEducationalValid', 'questions'],
};

