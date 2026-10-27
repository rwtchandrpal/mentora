import mongoose, { Document, Model, Schema } from 'mongoose';
import {
  LearningMode,
  ExplainStatus,
  ExplainStepType,
  InteractStatus,
  ChatRole,
  MilestoneStatus,
  PracticeTier,
  BatchStatus,
  MAX_TOPIC_QUERY_LENGTH,
  EXPLAIN_CORE_STEPS_COUNT,
  MAX_SOCRATIC_STRIKES,
} from '@mentora/shared';

export interface IDeepDiveSubCard {
  id: string;
  depthLevel: number;
  title: string;
  contentMarkdown: string;
  createdAt: string;
}

export interface IExplainCard {
  stepNumber: number;
  stepType: ExplainStepType;
  title: string;
  contentMarkdown: string;
  checkQuestion: string | null;
  checkAnswer: string | null;
  deepDives: IDeepDiveSubCard[];
}

export interface IExplainState {
  status: ExplainStatus;
  currentStepIndex: number;
  cards: IExplainCard[];
  suggestedSubTopics: string[];
}

export interface IInteractMilestone {
  milestoneNumber: number;
  title: string;
  description: string;
  status: MilestoneStatus;
}

export interface IInteractMessage {
  id: string;
  role: ChatRole;
  content: string;
  milestoneNumber: number;
  strikeNumberAtTurn: number;
  isCircuitBreakerExplanation: boolean;
  createdAt: string;
}

export interface IInteractState {
  status: InteractStatus;
  activeMilestoneIndex: number;
  strikeCount: number;
  milestones: IInteractMilestone[];
  messages: IInteractMessage[];
}

export interface IMcqQuestion {
  questionNumber: number;
  questionText: string;
  options: string[];
  hint: string;
  solutionExplanation: string;
  correctOptionIndex: number;
}

export interface IPracticeBatch {
  tier: PracticeTier;
  status: BatchStatus;
  score: number | null;
  questions: IMcqQuestion[];
  userAnswers: number[];
  completedAt: Date | null;
}

export interface IPracticeState {
  activeTier: PracticeTier;
  batches: {
    easy: IPracticeBatch;
    medium: IPracticeBatch;
    hard: IPracticeBatch;
  };
}

export interface ITopicSession {
  userId: mongoose.Types.ObjectId;
  topicQuery: string;
  normalizedTitle: string;
  lastActiveMode: LearningMode;
  explainState: IExplainState;
  interactState: IInteractState;
  practiceState: IPracticeState;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITopicSessionDocument extends ITopicSession, Document {
  _id: mongoose.Types.ObjectId;
}

export type TopicSessionModel = Model<ITopicSessionDocument>;

const DeepDiveSubCardSchema = new Schema<IDeepDiveSubCard>(
  {
    id: { type: String, required: true },
    depthLevel: { type: Number, required: true, default: 1 },
    title: { type: String, required: true, trim: true },
    contentMarkdown: { type: String, required: true, trim: true },
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  { _id: false }
);

const ExplainCardSchema = new Schema<IExplainCard>(
  {
    stepNumber: {
      type: Number,
      required: true,
      min: 1,
      max: EXPLAIN_CORE_STEPS_COUNT,
    },
    stepType: {
      type: String,
      required: true,
      enum: Object.values(ExplainStepType),
    },
    title: { type: String, required: true, trim: true },
    contentMarkdown: { type: String, required: true, trim: true },
    checkQuestion: { type: String, default: null },
    checkAnswer: { type: String, default: null },
    deepDives: { type: [DeepDiveSubCardSchema], default: [] },
  },
  { _id: false }
);

const ExplainStateSchema = new Schema<IExplainState>(
  {
    status: {
      type: String,
      enum: Object.values(ExplainStatus),
      default: ExplainStatus.NOT_STARTED,
    },
    currentStepIndex: {
      type: Number,
      default: 0,
      min: 0,
      max: EXPLAIN_CORE_STEPS_COUNT - 1,
    },
    cards: { type: [ExplainCardSchema], default: [] },
    suggestedSubTopics: { type: [String], default: [] },
  },
  { _id: false }
);

const InteractMilestoneSchema = new Schema<IInteractMilestone>(
  {
    milestoneNumber: { type: Number, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: Object.values(MilestoneStatus),
      default: MilestoneStatus.PENDING,
    },
  },
  { _id: false }
);

const InteractMessageSchema = new Schema<IInteractMessage>(
  {
    id: { type: String, required: true },
    role: { type: String, enum: Object.values(ChatRole), required: true },
    content: { type: String, required: true },
    milestoneNumber: { type: Number, required: true },
    strikeNumberAtTurn: {
      type: Number,
      default: 0,
      min: 0,
      max: MAX_SOCRATIC_STRIKES,
    },
    isCircuitBreakerExplanation: { type: Boolean, default: false },
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  { _id: false }
);

const InteractStateSchema = new Schema<IInteractState>(
  {
    status: {
      type: String,
      enum: Object.values(InteractStatus),
      default: InteractStatus.NOT_STARTED,
    },
    activeMilestoneIndex: { type: Number, default: 0, min: 0 },
    strikeCount: {
      type: Number,
      default: 0,
      min: 0,
      max: MAX_SOCRATIC_STRIKES - 1,
    },
    milestones: { type: [InteractMilestoneSchema], default: [] },
    messages: { type: [InteractMessageSchema], default: [] },
  },
  { _id: false }
);

const McqQuestionSchema = new Schema<IMcqQuestion>(
  {
    questionNumber: { type: Number, required: true },
    questionText: { type: String, required: true, trim: true },
    options: { type: [String], required: true },
    hint: { type: String, required: true, trim: true },
    solutionExplanation: { type: String, required: true, trim: true },
    correctOptionIndex: { type: Number, required: true, min: 0, max: 3 },
  },
  { _id: false }
);

const PracticeBatchSchema = new Schema<IPracticeBatch>(
  {
    tier: {
      type: String,
      enum: Object.values(PracticeTier),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(BatchStatus),
      required: true,
    },
    score: { type: Number, default: null },
    questions: { type: [McqQuestionSchema], default: [] },
    userAnswers: { type: [Number], default: [] },
    completedAt: { type: Date, default: null },
  },
  { _id: false }
);

const PracticeStateSchema = new Schema<IPracticeState>(
  {
    activeTier: {
      type: String,
      enum: Object.values(PracticeTier),
      default: PracticeTier.EASY,
    },
    batches: {
      easy: {
        type: PracticeBatchSchema,
        default: () => ({
          tier: PracticeTier.EASY,
          status: BatchStatus.NOT_STARTED,
          score: null,
          questions: [],
          userAnswers: [],
          completedAt: null,
        }),
      },
      medium: {
        type: PracticeBatchSchema,
        default: () => ({
          tier: PracticeTier.MEDIUM,
          status: BatchStatus.LOCKED,
          score: null,
          questions: [],
          userAnswers: [],
          completedAt: null,
        }),
      },
      hard: {
        type: PracticeBatchSchema,
        default: () => ({
          tier: PracticeTier.HARD,
          status: BatchStatus.LOCKED,
          score: null,
          questions: [],
          userAnswers: [],
          completedAt: null,
        }),
      },
    },
  },
  { _id: false }
);

export const TopicSessionSchema = new Schema<ITopicSessionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    topicQuery: {
      type: String,
      required: true,
      trim: true,
      maxlength: MAX_TOPIC_QUERY_LENGTH,
    },
    normalizedTitle: {
      type: String,
      required: true,
      trim: true,
    },
    lastActiveMode: {
      type: String,
      enum: Object.values(LearningMode),
      required: true,
      default: LearningMode.EXPLAIN,
    },
    explainState: {
      type: ExplainStateSchema,
      default: () => ({
        status: ExplainStatus.NOT_STARTED,
        currentStepIndex: 0,
        cards: [],
        suggestedSubTopics: [],
      }),
    },
    interactState: {
      type: InteractStateSchema,
      default: () => ({
        status: InteractStatus.NOT_STARTED,
        activeMilestoneIndex: 0,
        strikeCount: 0,
        milestones: [],
        messages: [],
      }),
    },
    practiceState: {
      type: PracticeStateSchema,
      default: () => ({
        activeTier: PracticeTier.EASY,
        batches: {
          easy: {
            tier: PracticeTier.EASY,
            status: BatchStatus.NOT_STARTED,
            score: null,
            questions: [],
            userAnswers: [],
            completedAt: null,
          },
          medium: {
            tier: PracticeTier.MEDIUM,
            status: BatchStatus.LOCKED,
            score: null,
            questions: [],
            userAnswers: [],
            completedAt: null,
          },
          hard: {
            tier: PracticeTier.HARD,
            status: BatchStatus.LOCKED,
            score: null,
            questions: [],
            userAnswers: [],
            completedAt: null,
          },
        },
      }),
    },
  },
  {
    timestamps: true,
  }
);

TopicSessionSchema.index({ userId: 1, updatedAt: -1 });
TopicSessionSchema.index({ _id: 1, userId: 1 });

export const TopicSession =
  (mongoose.models.TopicSession as TopicSessionModel) ||
  mongoose.model<ITopicSessionDocument, TopicSessionModel>(
    'TopicSession',
    TopicSessionSchema
  );

export { TopicSession as TopicSessionModel };
