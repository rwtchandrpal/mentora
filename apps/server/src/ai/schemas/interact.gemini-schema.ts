import { Type, type Schema } from '@google/genai';

/**
 * Gemini responseSchema for Interact Mode milestone decomposition & opening diagnostic.
 * Aligns with @mentora/shared InteractInitOutputSchema.
 */
export const interactInitGeminiSchema: Schema = {
  type: Type.OBJECT,
  description: 'Interact Mode milestone sequence and opening diagnostic question or educational refusal notice.',
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
    milestones: {
      type: Type.ARRAY,
      description: '3 to 5 sequential conceptual milestones covering the topic progressively.',
      items: {
        type: Type.OBJECT,
        properties: {
          milestoneNumber: {
            type: Type.INTEGER,
            description: 'Sequential milestone index starting at 1.',
          },
          title: {
            type: Type.STRING,
            description: 'Short, descriptive title for the milestone.',
          },
          description: {
            type: Type.STRING,
            description: 'Clear statement of the conceptual understanding required to master this milestone.',
          },
        },
        required: ['milestoneNumber', 'title', 'description'],
      },
    },
    openingQuestion: {
      type: Type.STRING,
      description: 'Engaging, open-ended diagnostic question anchored to Milestone 1 assessing learner baseline understanding.',
    },
  },
  required: ['isEducationalValid', 'milestones'],
};

