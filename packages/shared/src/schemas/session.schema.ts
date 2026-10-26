import { z } from 'zod';
import { MAX_TOPIC_QUERY_LENGTH } from '../constants/index.js';
import { LEARNING_MODES } from '../enums/index.js';
import { ExplainStateSchema } from './explain.schema.js';
import { InteractStateSchema } from './interact.schema.js';
import {
  PracticeStateDTOSchema,
  PracticeStateFullSchema,
} from './practice.schema.js';

export const LearningModeSchema = z.enum(LEARNING_MODES);

export const CreateSessionRequestSchema = z.object({
  topicQuery: z.string().trim().min(1).max(MAX_TOPIC_QUERY_LENGTH),
  initialMode: LearningModeSchema,
});

export const SwitchModeRequestSchema = z.object({
  mode: LearningModeSchema,
});

export const SessionSummaryDTOSchema = z.object({
  id: z.string().min(1),
  _id: z.string().min(1).optional(),
  topicQuery: z.string(),
  normalizedTitle: z.string(),
  lastActiveMode: LearningModeSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TopicSessionDTOSchema = z.object({
  id: z.string().min(1),
  _id: z.string().min(1).optional(),
  userId: z.string().min(1),
  topicQuery: z.string(),
  normalizedTitle: z.string(),
  lastActiveMode: LearningModeSchema,
  explainState: ExplainStateSchema,
  interactState: InteractStateSchema,
  practiceState: PracticeStateDTOSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TopicSessionFullSchema = z.object({
  id: z.string().min(1),
  _id: z.string().min(1).optional(),
  userId: z.string().min(1),
  topicQuery: z.string(),
  normalizedTitle: z.string(),
  lastActiveMode: LearningModeSchema,
  explainState: ExplainStateSchema,
  interactState: InteractStateSchema,
  practiceState: PracticeStateFullSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
