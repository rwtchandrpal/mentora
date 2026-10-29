import {
  LearningMode,
  ErrorCode,
  BatchStatus,
  PracticeTier,
  SessionSummaryDTO,
  TopicSessionDTO,
  CreateSessionRequestDTO,
  PracticeBatchDTO,
  SessionSummaryDTOSchema,
  TopicSessionDTOSchema,
  PracticeBatchDTOSchema,
} from '@mentora/shared';
import { AppError } from '../utils/AppError.js';
import {
  sessionRepository,
  SessionRepository,
} from '../repositories/session.repository.js';
import {
  ITopicSessionDocument,
  IPracticeBatch,
} from '../models/TopicSession.model.js';
import { explainService, ExplainService } from './explain.service.js';
import { interactService, InteractService } from './interact.service.js';
import { practiceService, PracticeService } from './practice.service.js';

const toIsoString = (val: Date | string | null | undefined): string => {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) return val.toISOString();
  return new Date(val).toISOString();
};

const toNullableIsoString = (
  val: Date | string | null | undefined
): string | null => {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return new Date(val).toISOString();
};

export const sanitizePracticeBatch = (
  batch: IPracticeBatch
): PracticeBatchDTO => {
  const isCompleted = batch.status === BatchStatus.COMPLETED;
  const questions = (batch.questions || []).map((q) => {
    if (isCompleted) {
      return {
        questionNumber: q.questionNumber,
        questionText: q.questionText,
        options: [...q.options],
        hint: q.hint,
        solutionExplanation: q.solutionExplanation,
        correctOptionIndex: q.correctOptionIndex,
      };
    }
    return {
      questionNumber: q.questionNumber,
      questionText: q.questionText,
      options: [...q.options],
      hint: q.hint,
    };
  });

  const baseBatch = {
    tier: batch.tier,
    status: batch.status,
    score: batch.score ?? null,
    questions,
    userAnswers: batch.userAnswers ? [...batch.userAnswers] : [],
    completedAt: toNullableIsoString(batch.completedAt),
  };

  return PracticeBatchDTOSchema.parse(baseBatch);
};

export const toSessionSummaryDTO = (
  doc: ITopicSessionDocument
): SessionSummaryDTO => {
  const rawSummary = {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    topicQuery: doc.topicQuery,
    normalizedTitle: doc.normalizedTitle,
    lastActiveMode: doc.lastActiveMode,
    createdAt: toIsoString(doc.createdAt),
    updatedAt: toIsoString(doc.updatedAt),
  };
  return SessionSummaryDTOSchema.parse(rawSummary);
};

export const toTopicSessionDTO = (
  doc: ITopicSessionDocument
): TopicSessionDTO => {
  const rawDto = {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    userId: doc.userId.toString(),
    topicQuery: doc.topicQuery,
    normalizedTitle: doc.normalizedTitle,
    lastActiveMode: doc.lastActiveMode,
    explainState: {
      status: doc.explainState.status,
      currentStepIndex: doc.explainState.currentStepIndex,
      cards: (doc.explainState.cards || []).map((c) => ({
        stepNumber: c.stepNumber,
        stepType: c.stepType,
        title: c.title,
        contentMarkdown: c.contentMarkdown,
        checkQuestion: c.checkQuestion ?? null,
        checkAnswer: c.checkAnswer ?? null,
        deepDives: (c.deepDives || []).map((dd) => ({
          id: dd.id,
          depthLevel: dd.depthLevel,
          title: dd.title,
          contentMarkdown: dd.contentMarkdown,
          createdAt: dd.createdAt,
        })),
      })),
      suggestedSubTopics: doc.explainState.suggestedSubTopics
        ? [...doc.explainState.suggestedSubTopics]
        : [],
    },
    interactState: {
      status: doc.interactState.status,
      activeMilestoneIndex: doc.interactState.activeMilestoneIndex,
      strikeCount: doc.interactState.strikeCount,
      milestones: (doc.interactState.milestones || []).map((m) => ({
        milestoneNumber: m.milestoneNumber,
        title: m.title,
        description: m.description,
        status: m.status,
      })),
      messages: (doc.interactState.messages || []).map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        milestoneNumber: msg.milestoneNumber,
        strikeNumberAtTurn: msg.strikeNumberAtTurn,
        isCircuitBreakerExplanation: msg.isCircuitBreakerExplanation,
        createdAt: msg.createdAt,
      })),
    },
    practiceState: {
      activeTier: doc.practiceState.activeTier,
      batches: {
        easy: sanitizePracticeBatch(doc.practiceState.batches.easy),
        medium: sanitizePracticeBatch(doc.practiceState.batches.medium),
        hard: sanitizePracticeBatch(doc.practiceState.batches.hard),
      },
    },
    createdAt: toIsoString(doc.createdAt),
    updatedAt: toIsoString(doc.updatedAt),
  };

  return TopicSessionDTOSchema.parse(rawDto);
};

export class SessionService {
  constructor(
    private readonly repository: SessionRepository = sessionRepository,
    private readonly explainServ: ExplainService = explainService,
    private readonly interactServ: InteractService = interactService,
    private readonly practiceServ: PracticeService = practiceService
  ) {}

  async createSession(
    userId: string,
    input: CreateSessionRequestDTO
  ): Promise<TopicSessionDTO> {
    const normalizedTitle = input.topicQuery.trim();
    const sessionDoc = await this.repository.create({
      userId,
      topicQuery: input.topicQuery,
      normalizedTitle,
      initialMode: input.initialMode,
    });

    if (input.autoInitialize === false) {
      return toTopicSessionDTO(sessionDoc);
    }

    const sessionId = sessionDoc._id.toString();

    try {
      if (input.initialMode === LearningMode.EXPLAIN) {
        return await this.explainServ.initializeExplain(userId, sessionId);
      } else if (input.initialMode === LearningMode.INTERACT) {
        const result = await this.interactServ.initializeInteract(userId, sessionId);
        return result.session;
      } else if (input.initialMode === LearningMode.PRACTICE) {
        return await this.practiceServ.generateBatch(
          userId,
          sessionId,
          PracticeTier.EASY
        );
      }
      return toTopicSessionDTO(sessionDoc);
    } catch (error) {
      await this.repository.deleteByIdAndUserId(sessionId, userId);
      throw error;
    }
  }

  async listSessions(userId: string): Promise<SessionSummaryDTO[]> {
    const docs = await this.repository.listSummariesByUserId(userId);
    return docs.map(toSessionSummaryDTO);
  }

  async getSessionById(userId: string, sessionId: string): Promise<TopicSessionDTO> {
    const doc = await this.repository.findByIdAndUserId(sessionId, userId);
    if (!doc) {
      throw new AppError(404, ErrorCode.RESOURCE_NOT_FOUND, 'Topic session not found');
    }
    return toTopicSessionDTO(doc);
  }

  async switchMode(
    userId: string,
    sessionId: string,
    mode: LearningMode
  ): Promise<TopicSessionDTO> {
    const doc = await this.repository.updateLastActiveMode(sessionId, userId, mode);
    if (!doc) {
      throw new AppError(404, ErrorCode.RESOURCE_NOT_FOUND, 'Topic session not found');
    }
    return toTopicSessionDTO(doc);
  }

  async deleteSession(
    userId: string,
    sessionId: string
  ): Promise<{ deletedId: string }> {
    const deleted = await this.repository.deleteByIdAndUserId(sessionId, userId);
    if (!deleted) {
      throw new AppError(404, ErrorCode.RESOURCE_NOT_FOUND, 'Topic session not found');
    }
    return { deletedId: sessionId };
  }
}

export const sessionService = new SessionService();
