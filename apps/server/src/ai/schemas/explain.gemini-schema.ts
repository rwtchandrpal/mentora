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
      description: 'The 4 progressive explanation cards (Intuition -> Core Mechanism -> Example -> Check-for-Understanding).',
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
            description: 'Targeted reflection question for Step 4 (CFU), or null for steps 1-3.',
            nullable: true,
          },
          checkAnswer: {
            type: Type.STRING,
            description: 'Targeted reflection answer reveal for Step 4 (CFU), or null for steps 1-3.',
            nullable: true,
          },
        },
        required: ['stepNumber', 'stepType', 'title', 'contentMarkdown'],
      },
    },
    suggestedSubTopics: {
      type: Type.ARRAY,
      description: '3 to 5 narrower sub-topics or logical next steps for deeper learning.',
      items: {
        type: Type.STRING,
      },
    },
  },
  required: ['isEducationalValid', 'cards'],
};

/**
 * Gemini responseSchema for Explain Mode vertical "Go Deeper" sub-card.
 * Aligns with @mentora/shared ExplainDeepDiveOutputSchema.
 */
export const explainDeepDiveGeminiSchema: Schema = {
  type: Type.OBJECT,
  description: 'Vertical deep-dive sub-card providing deeper mathematical, algorithmic, or architectural detail.',
  properties: {
    title: {
      type: Type.STRING,
      description: 'Specific technical or architectural title for this vertical deep-dive sub-card.',
    },
    contentMarkdown: {
      type: Type.STRING,
      description: 'Advanced technical explanations, formal derivations, proofs, code, or architecture diagrams in rich Markdown adhering to LaTeX and quoted Mermaid syntax.',
    },
  },
  required: ['title', 'contentMarkdown'],
};

