import { Type, type Schema } from '@google/genai';
import { ExplainStepType } from '@mentora/shared';

/**
 * Gemini responseSchema for Explain Mode 4-card progressive initialization.
 * Aligns with @mentora/shared ExplainInitOutputSchema.
 */
export const explainInitGeminiSchema: Schema = {
  type: Type.OBJECT,
  description: 'Explain Mode 4-card progressive breakdown or educational refusal notice.',
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
    cards: {
      type: Type.ARRAY,
      description: 'The progressive explanation cards. When isEducationalValid is true, this array MUST contain EXACTLY 4 cards: step 1 (intuition), step 2 (core_mechanism), step 3 (example), step 4 (check_for_understanding). When isEducationalValid is false, return empty array [].',
      items: {
        type: Type.OBJECT,
        properties: {
          stepNumber: {
            type: Type.INTEGER,
            description: 'Sequential step number from 1 to 4.',
          },
          stepType: {
            type: Type.STRING,
            enum: [
              ExplainStepType.INTUITION,
              ExplainStepType.CORE_MECHANISM,
              ExplainStepType.EXAMPLE,
              ExplainStepType.CHECK_FOR_UNDERSTANDING,
            ],
            description: 'Pedagogical step type corresponding to the 4-step sequence.',
          },
          title: {
            type: Type.STRING,
            description: 'Clear, concise title for this card.',
          },
          contentMarkdown: {
            type: Type.STRING,
            description: 'Rich Markdown content adhering to LaTeX math ($...$, $$...$$), language-tagged code blocks, and quoted Mermaid diagram syntax.',
          },
          checkQuestion: {
            type: Type.STRING,
            description: 'Targeted reflection question for Step 4 (CFU) specifically testing comprehension of the topic, or null for steps 1-3.',
            nullable: true,
          },
          checkAnswer: {
            type: Type.STRING,
            description: 'Accurate, explanatory answer reveal for Step 4 (CFU) directly answering checkQuestion. Required non-empty string on Step 4; null for steps 1-3.',
            nullable: true,
          },
        },
        required: ['stepNumber', 'stepType', 'title', 'contentMarkdown', 'checkQuestion', 'checkAnswer'],
      },
    },
  },
  required: ['isEducationalValid', 'cards'],
};
