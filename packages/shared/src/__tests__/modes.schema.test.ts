import { describe, it, expect } from 'vitest';
import {
  // Constants
  MCQ_BATCH_SIZE,
  MCQ_OPTIONS_COUNT,
  EXPLAIN_CORE_STEPS_COUNT,
  MIN_INTERACT_MILESTONES,
  MAX_INTERACT_MILESTONES,
  MAX_TOPIC_QUERY_LENGTH,
  MAX_INTERACT_MESSAGE_LENGTH,
  MAX_DEEP_DIVE_DEPTH,
  MAX_SOCRATIC_STRIKES,
  // Enums
  ExplainStepType,
  EXPLAIN_STEP_TYPES,
  ExplainStatus,
  EXPLAIN_STATUSES,
  InteractStatus,
  INTERACT_STATUSES,
  ChatRole,
  CHAT_ROLES,
  SocraticOutcome,
  SOCRATIC_OUTCOMES,
  PracticeTier,
  BatchStatus,
  LearningMode,
  ErrorCode,
  // Explain Schemas
  DeepDiveSubCardSchema,
  ExplainCardSchema,
  ExplainInitOutputSchema,
  ExplainDeepDiveOutputSchema,
  ExplainStepRequestSchema,
  ExplainDeeperRequestSchema,
  ExplainStateSchema,
  // Interact Schemas
  InteractMilestoneSchema,
  InteractMessageSchema,
  InteractInitOutputSchema,
  InteractStreamRequestSchema,
  MentoraStreamControlHeaderSchema,
  SseStartEventSchema,
  SseTokenEventSchema,
  SseMetadataEventSchema,
  SseErrorEventSchema,
  InteractStateSchema,
  // Practice Schemas
  MCQ_QUESTION_FULL_KEY_ORDER,
  McqQuestionFullSchema,
  McqQuestionMaskedSchema,
  PracticeBatchGenerationSchema,
  PracticeGenerateRequestSchema,
  PracticeSubmitRequestSchema,
  PracticeBatchFullSchema,
  PracticeBatchDTOSchema,
  PracticeStateDTOSchema,
  PracticeStateFullSchema,
  QuizDraftStorageSchema,
  // Session Schemas
  CreateSessionRequestSchema,
  SwitchModeRequestSchema,
  SessionSummaryDTOSchema,
  TopicSessionDTOSchema,
  TopicSessionFullSchema,
} from '../index.js';

describe('IMP-003: Mode Constants and Enums Verification', () => {
  it('should verify mode constants match specification values', () => {
    expect(MCQ_OPTIONS_COUNT).toBe(4);
    expect(EXPLAIN_CORE_STEPS_COUNT).toBe(4);
    expect(MIN_INTERACT_MILESTONES).toBe(3);
    expect(MAX_INTERACT_MILESTONES).toBe(5);
    expect(MAX_DEEP_DIVE_DEPTH).toBe(2);
    expect(MAX_SOCRATIC_STRIKES).toBe(3);
  });

  it('should verify mode enums contain expected members', () => {
    expect(EXPLAIN_STEP_TYPES).toEqual([
      'intuition',
      'core_mechanism',
      'example',
      'check_for_understanding',
    ]);
    expect(EXPLAIN_STATUSES).toEqual(['not_started', 'ready']);
    expect(INTERACT_STATUSES).toEqual(['not_started', 'active', 'completed']);
    expect(CHAT_ROLES).toEqual(['user', 'assistant']);
    expect(SOCRATIC_OUTCOMES).toEqual(['ADVANCE', 'STRIKE', 'CIRCUIT_BREAKER_ACK']);
    expect(SocraticOutcome.ADVANCE).toBe('ADVANCE');
  });
});

describe('IMP-003: Explain Mode Schemas', () => {
  const valid4Cards = [
    {
      stepNumber: 1,
      stepType: ExplainStepType.INTUITION,
      title: 'Intuitive Overview',
      contentMarkdown: 'High-level mental model...',
    },
    {
      stepNumber: 2,
      stepType: ExplainStepType.CORE_MECHANISM,
      title: 'Core Rules & Architecture',
      contentMarkdown: 'Formal explanation with $E = mc^2$...',
    },
    {
      stepNumber: 3,
      stepType: ExplainStepType.EXAMPLE,
      title: 'Applied Example',
      contentMarkdown: 'Real world code walkthrough...',
    },
    {
      stepNumber: 4,
      stepType: ExplainStepType.CHECK_FOR_UNDERSTANDING,
      title: 'Self-Check Question',
      contentMarkdown: 'Check your grasp of this topic.',
      checkQuestion: 'What is the primary constraint?',
      checkAnswer: 'Resource contention.',
    },
  ];

  it('should accept valid 4-card ExplainInitOutputSchema when isEducationalValid is true', () => {
    const validOutput = {
      isEducationalValid: true,
      normalizedTitle: 'Binary Search Trees',
      cards: valid4Cards,
      suggestedSubTopics: ['AVL Trees', 'Red-Black Trees'],
    };

    const parsed = ExplainInitOutputSchema.parse(validOutput);
    expect(parsed.isEducationalValid).toBe(true);
    expect(parsed.cards).toHaveLength(4);
    expect(parsed.cards[0]?.deepDives).toEqual([]);
    expect(parsed.cards[3]?.checkQuestion).toBe('What is the primary constraint?');
  });

  it('should validate single ExplainCardSchema', () => {
    const card = ExplainCardSchema.parse(valid4Cards[0]);
    expect(card.stepNumber).toBe(1);
    expect(card.deepDives).toEqual([]);
  });

  it('should reject ExplainInitOutputSchema when isEducationalValid is true but cards length is not 4', () => {
    const threeCards = {
      isEducationalValid: true,
      cards: valid4Cards.slice(0, 3),
    };
    const result = ExplainInitOutputSchema.safeParse(threeCards);
    expect(result.success).toBe(false);
  });

  it('should reject ExplainInitOutputSchema when card step ordering or step types are incorrect', () => {
    const wrongOrder = {
      isEducationalValid: true,
      cards: [
        valid4Cards[1]!, // stepNumber: 2 first
        valid4Cards[0]!,
        valid4Cards[2]!,
        valid4Cards[3]!,
      ],
    };
    const resultOrder = ExplainInitOutputSchema.safeParse(wrongOrder);
    expect(resultOrder.success).toBe(false);

    const wrongType = {
      isEducationalValid: true,
      cards: valid4Cards.map((c, i) => (i === 0 ? { ...c, stepType: 'example' as const } : c)),
    };
    const resultType = ExplainInitOutputSchema.safeParse(wrongType);
    expect(resultType.success).toBe(false);
  });

  it('should accept ExplainInitOutputSchema with isEducationalValid: false and non-empty refusalReason', () => {
    const refusal = {
      isEducationalValid: false,
      refusalReason: 'Mentora is dedicated to educational subjects. Please input an academic topic.',
      cards: [],
    };
    const parsed = ExplainInitOutputSchema.parse(refusal);
    expect(parsed.isEducationalValid).toBe(false);
    expect(parsed.refusalReason).toContain('educational');
    expect(parsed.cards).toHaveLength(0);
  });

  it('should reject ExplainInitOutputSchema when isEducationalValid is false but refusalReason is missing or empty', () => {
    expect(
      ExplainInitOutputSchema.safeParse({
        isEducationalValid: false,
        refusalReason: '',
      }).success,
    ).toBe(false);

    expect(
      ExplainInitOutputSchema.safeParse({
        isEducationalValid: false,
      }).success,
    ).toBe(false);
  });

  it('should enforce ExplainStepRequestSchema bounds (0..3)', () => {
    expect(ExplainStepRequestSchema.safeParse({ currentStepIndex: 0 }).success).toBe(true);
    expect(ExplainStepRequestSchema.safeParse({ currentStepIndex: 3 }).success).toBe(true);
    expect(ExplainStepRequestSchema.safeParse({ currentStepIndex: -1 }).success).toBe(false);
    expect(ExplainStepRequestSchema.safeParse({ currentStepIndex: 4 }).success).toBe(false);
    expect(ExplainStepRequestSchema.safeParse({ currentStepIndex: 1.5 }).success).toBe(false);
  });

  it('should enforce ExplainDeeperRequestSchema bounds (1..4)', () => {
    expect(ExplainDeeperRequestSchema.safeParse({ stepNumber: 1 }).success).toBe(true);
    expect(ExplainDeeperRequestSchema.safeParse({ stepNumber: 4 }).success).toBe(true);
    expect(ExplainDeeperRequestSchema.safeParse({ stepNumber: 0 }).success).toBe(false);
    expect(ExplainDeeperRequestSchema.safeParse({ stepNumber: 5 }).success).toBe(false);
  });

  it('should validate DeepDiveSubCardSchema and ExplainDeepDiveOutputSchema', () => {
    const deepDiveOutput = {
      title: 'Mathematical Proof of Asymptotic Bound',
      contentMarkdown: 'Theorem: $\\sum_{i=1}^n i = \\frac{n(n+1)}{2}$...',
    };
    expect(ExplainDeepDiveOutputSchema.safeParse(deepDiveOutput).success).toBe(true);

    const deepDiveCard = {
      id: 'subcard_1',
      depthLevel: 1,
      title: deepDiveOutput.title,
      contentMarkdown: deepDiveOutput.contentMarkdown,
      createdAt: '2026-10-26T00:00:00.000Z',
    };
    expect(DeepDiveSubCardSchema.safeParse(deepDiveCard).success).toBe(true);

    // Max depth level is 2
    expect(DeepDiveSubCardSchema.safeParse({ ...deepDiveCard, depthLevel: 3 }).success).toBe(false);
  });

  it('should validate ExplainStateSchema', () => {
    const explainState = {
      status: ExplainStatus.READY,
      currentStepIndex: 1,
      cards: valid4Cards.map((c) => ({ ...c, deepDives: [] })),
      suggestedSubTopics: ['Topic A', 'Topic B'],
    };
    const parsed = ExplainStateSchema.parse(explainState);
    expect(parsed.status).toBe('ready');
    expect(parsed.currentStepIndex).toBe(1);
  });
});

describe('IMP-003: Interact Mode Schemas', () => {
  const sampleMilestones = [
    {
      milestoneNumber: 1,
      title: 'Define Deadlock Conditions',
      description: 'Mutual exclusion, hold and wait, no preemption, circular wait.',
      status: 'active' as const,
    },
    {
      milestoneNumber: 2,
      title: 'Resource Allocation Graph',
      description: 'Cycle detection in single-instance systems.',
      status: 'pending' as const,
    },
    {
      milestoneNumber: 3,
      title: 'Banker’s Algorithm & Avoidance',
      description: 'Safe state derivation and resource request algorithm.',
      status: 'pending' as const,
    },
  ];

  it('should validate single InteractMilestoneSchema', () => {
    const milestone = InteractMilestoneSchema.parse(sampleMilestones[0]);
    expect(milestone.milestoneNumber).toBe(1);
    expect(milestone.status).toBe('active');
  });

  it('should accept InteractInitOutputSchema with 3 to 5 milestones when isEducationalValid is true', () => {
    const valid3 = {
      isEducationalValid: true,
      milestones: sampleMilestones,
      openingQuestion: 'What condition must hold for two threads to experience mutual exclusion?',
    };
    expect(InteractInitOutputSchema.safeParse(valid3).success).toBe(true);

    const valid5 = {
      isEducationalValid: true,
      milestones: [
        ...sampleMilestones,
        { milestoneNumber: 4, title: 'Prevention Strategies', description: 'Eliminating hold-and-wait' },
        { milestoneNumber: 5, title: 'Recovery Mechanics', description: 'Process termination & rollback' },
      ],
      openingQuestion: 'What are deadlocks in operating systems?',
    };
    expect(InteractInitOutputSchema.safeParse(valid5).success).toBe(true);
  });

  it('should reject InteractInitOutputSchema with fewer than 3 or more than 5 milestones', () => {
    const twoMilestones = {
      isEducationalValid: true,
      milestones: sampleMilestones.slice(0, 2),
      openingQuestion: 'Opening diagnostic prompt?',
    };
    expect(InteractInitOutputSchema.safeParse(twoMilestones).success).toBe(false);

    const sixMilestones = {
      isEducationalValid: true,
      milestones: [
        ...sampleMilestones,
        { milestoneNumber: 4, title: 'M4', description: 'D4' },
        { milestoneNumber: 5, title: 'M5', description: 'D5' },
        { milestoneNumber: 6, title: 'M6', description: 'D6' },
      ],
      openingQuestion: 'Opening diagnostic prompt?',
    };
    expect(InteractInitOutputSchema.safeParse(sixMilestones).success).toBe(false);
  });

  it('should reject InteractInitOutputSchema when openingQuestion is missing or empty when isEducationalValid is true', () => {
    expect(
      InteractInitOutputSchema.safeParse({
        isEducationalValid: true,
        milestones: sampleMilestones,
        openingQuestion: '   ',
      }).success,
    ).toBe(false);

    expect(
      InteractInitOutputSchema.safeParse({
        isEducationalValid: true,
        milestones: sampleMilestones,
      }).success,
    ).toBe(false);
  });

  it('should accept InteractInitOutputSchema with isEducationalValid: false and non-empty refusalReason', () => {
    const refusal = {
      isEducationalValid: false,
      refusalReason: 'Non-educational topics are outside of Mentora scope.',
      milestones: [],
    };
    expect(InteractInitOutputSchema.safeParse(refusal).success).toBe(true);
  });

  it('should enforce InteractStreamRequestSchema bounds (MAX_INTERACT_MESSAGE_LENGTH = 2000 chars)', () => {
    expect(
      InteractStreamRequestSchema.safeParse({
        message: 'Hello tutor!',
      }).success,
    ).toBe(true);

    const defaultCheck = InteractStreamRequestSchema.parse({ message: 'Hello' });
    expect(defaultCheck.forceDirectExplanation).toBe(false);

    expect(
      InteractStreamRequestSchema.safeParse({
        message: 'A'.repeat(MAX_INTERACT_MESSAGE_LENGTH + 1),
      }).success,
    ).toBe(false);

    expect(
      InteractStreamRequestSchema.safeParse({
        message: '   ',
      }).success,
    ).toBe(false);
  });

  it('should validate MentoraStreamControlHeaderSchema for ADVANCE, STRIKE, and CIRCUIT_BREAKER_ACK', () => {
    expect(MentoraStreamControlHeaderSchema.parse({ outcome: 'ADVANCE' }).outcome).toBe('ADVANCE');
    expect(MentoraStreamControlHeaderSchema.parse({ outcome: 'STRIKE' }).outcome).toBe('STRIKE');
    expect(
      MentoraStreamControlHeaderSchema.parse({ outcome: 'CIRCUIT_BREAKER_ACK' }).outcome,
    ).toBe('CIRCUIT_BREAKER_ACK');
    expect(MentoraStreamControlHeaderSchema.safeParse({ outcome: 'UNKNOWN' }).success).toBe(false);
  });

  it('should validate SSE event schemas (start, token, metadata, error)', () => {
    const startEvent = SseStartEventSchema.parse({
      turnId: 'turn_abc123',
      activeMilestoneIndex: 0,
    });
    expect(startEvent.turnId).toBe('turn_abc123');

    const tokenEvent = SseTokenEventSchema.parse({ delta: 'Let us consider ' });
    expect(tokenEvent.delta).toBe('Let us consider ');

    const metadataEvent = SseMetadataEventSchema.parse({
      activeMilestoneIndex: 1,
      strikeCount: 2,
      milestones: sampleMilestones,
      isCompleted: false,
      quota: {
        used: 5,
        limit: 50,
        resetAt: '2026-10-27T00:00:00.000Z',
      },
    });
    expect(metadataEvent.strikeCount).toBe(2);
    expect(metadataEvent.quota?.used).toBe(5);

    // strikeCount max is MAX_SOCRATIC_STRIKES - 1 = 2
    expect(
      SseMetadataEventSchema.safeParse({
        ...metadataEvent,
        strikeCount: 3,
      }).success,
    ).toBe(false);

    const errorEvent = SseErrorEventSchema.parse({
      code: ErrorCode.STREAM_INTERRUPTED,
      message: 'Connection interrupted mid-flight',
    });
    expect(errorEvent.code).toBe('STREAM_INTERRUPTED');
  });

  it('should validate InteractStateSchema and InteractMessageSchema', () => {
    const message = {
      id: 'msg_1',
      role: ChatRole.USER,
      content: 'I think circular wait means a cycle in resource requests.',
      milestoneNumber: 1,
      strikeNumberAtTurn: 0,
      isCircuitBreakerExplanation: false,
      createdAt: '2026-10-26T00:00:00.000Z',
    };
    expect(InteractMessageSchema.safeParse(message).success).toBe(true);

    const state = {
      status: InteractStatus.ACTIVE,
      activeMilestoneIndex: 0,
      strikeCount: 1,
      milestones: sampleMilestones,
      messages: [message],
    };
    const parsedState = InteractStateSchema.parse(state);
    expect(parsedState.strikeCount).toBe(1);
    expect(parsedState.messages).toHaveLength(1);
  });
});

describe('IMP-003: Practice Mode Schemas (Reasoning-First & Answer Masking)', () => {
  const createValidMcq = (num: number, correctIdx: number = 1) => ({
    questionNumber: num,
    questionText: `Question stem #${num}: What is the time complexity of operation?`,
    options: ['O(1)', 'O(log n)', 'O(n)', 'O(n^2)'],
    hint: `Consider binary search partitioning for #${num}.`,
    solutionExplanation: `Step-by-step derivation for #${num}: Since the search space halves every iteration, T(n) = T(n/2) + O(1), yielding O(log n). Therefore Option B is correct.`,
    correctOptionIndex: correctIdx,
  });

  it('should strictly guarantee FR-017 Reasoning-First property order: solutionExplanation precedes correctOptionIndex', () => {
    const keys = Object.keys(McqQuestionFullSchema.shape);
    expect(keys).toEqual(MCQ_QUESTION_FULL_KEY_ORDER);

    const solutionExplanationIndex = keys.indexOf('solutionExplanation');
    const correctOptionIndex = keys.indexOf('correctOptionIndex');

    expect(solutionExplanationIndex).toBeGreaterThan(-1);
    expect(correctOptionIndex).toBeGreaterThan(-1);
    expect(solutionExplanationIndex).toBe(correctOptionIndex - 1);
  });

  it('should accept PracticeBatchGenerationSchema with 10 sequential MCQs and valid options', () => {
    const validQuestions = Array.from({ length: MCQ_BATCH_SIZE }, (_, i) =>
      createValidMcq(i + 1, (i % 4)),
    );

    const validBatch = {
      isEducationalValid: true,
      normalizedTitle: 'Binary Search Practice',
      questions: validQuestions,
    };

    const parsed = PracticeBatchGenerationSchema.parse(validBatch);
    expect(parsed.isEducationalValid).toBe(true);
    expect(parsed.questions).toHaveLength(10);
    expect(parsed.questions[9]?.questionNumber).toBe(10);
    expect(parsed.questions[0]?.correctOptionIndex).toBe(0);
  });

  it('should reject PracticeBatchGenerationSchema with 9 MCQs, 3 options, or out-of-range correctOptionIndex', () => {
    const nineQuestions = Array.from({ length: 9 }, (_, i) => createValidMcq(i + 1));
    expect(
      PracticeBatchGenerationSchema.safeParse({
        isEducationalValid: true,
        questions: nineQuestions,
      }).success,
    ).toBe(false);

    const threeOptionsQuestion = {
      ...createValidMcq(1),
      options: ['A', 'B', 'C'], // must be 4 options
    };
    const invalidBatchOptions = {
      isEducationalValid: true,
      questions: [threeOptionsQuestion, ...Array.from({ length: 9 }, (_, i) => createValidMcq(i + 2))],
    };
    expect(PracticeBatchGenerationSchema.safeParse(invalidBatchOptions).success).toBe(false);

    const invalidIndexQuestion = {
      ...createValidMcq(1),
      correctOptionIndex: 4, // out of range: must be 0..3
    };
    const invalidBatchIndex = {
      isEducationalValid: true,
      questions: [invalidIndexQuestion, ...Array.from({ length: 9 }, (_, i) => createValidMcq(i + 2))],
    };
    expect(PracticeBatchGenerationSchema.safeParse(invalidBatchIndex).success).toBe(false);
  });

  it('should strip correctOptionIndex and solutionExplanation when parsed through McqQuestionMaskedSchema (BR-03)', () => {
    const fullQuestion = createValidMcq(1, 2);
    expect('correctOptionIndex' in fullQuestion).toBe(true);
    expect('solutionExplanation' in fullQuestion).toBe(true);

    const masked = McqQuestionMaskedSchema.parse(fullQuestion);
    expect(masked.questionNumber).toBe(1);
    expect(masked.questionText).toBe(fullQuestion.questionText);
    expect(masked.options).toEqual(fullQuestion.options);
    expect(masked.hint).toBe(fullQuestion.hint);

    // CRITICAL: verify keys are stripped from the resulting object
    expect('correctOptionIndex' in masked).toBe(false);
    expect('solutionExplanation' in masked).toBe(false);
    expect(Object.keys(masked)).toEqual(['questionNumber', 'questionText', 'options', 'hint']);
  });

  it('should validate PracticeGenerateRequestSchema', () => {
    expect(PracticeGenerateRequestSchema.parse({ tier: 'easy' }).tier).toBe('easy');
    expect(PracticeGenerateRequestSchema.safeParse({ tier: 'invalid' }).success).toBe(false);
  });

  it('should validate PracticeSubmitRequestSchema with exactly 10 answers in range 0..3', () => {
    const validSubmission = {
      tier: PracticeTier.EASY,
      answers: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1],
    };
    expect(PracticeSubmitRequestSchema.safeParse(validSubmission).success).toBe(true);

    // 9 answers rejected
    expect(
      PracticeSubmitRequestSchema.safeParse({
        tier: PracticeTier.EASY,
        answers: [0, 1, 2, 3, 0, 1, 2, 3, 0],
      }).success,
    ).toBe(false);

    // answer index 4 rejected
    expect(
      PracticeSubmitRequestSchema.safeParse({
        tier: PracticeTier.EASY,
        answers: [0, 1, 2, 3, 0, 1, 2, 3, 0, 4],
      }).success,
    ).toBe(false);
  });

  it('should mask questions in PracticeBatchDTOSchema when in_progress and preserve them when completed', () => {
    const fullQuestions = Array.from({ length: MCQ_BATCH_SIZE }, (_, i) => createValidMcq(i + 1, 1));

    // in_progress batch
    const inProgressBatch = {
      tier: PracticeTier.EASY,
      status: BatchStatus.IN_PROGRESS,
      score: null,
      questions: fullQuestions,
      userAnswers: [],
      completedAt: null,
    };

    const parsedInProgress = PracticeBatchDTOSchema.parse(inProgressBatch);
    expect(parsedInProgress.status).toBe('in_progress');
    expect(parsedInProgress.questions).toHaveLength(10);
    // Keys must be stripped
    expect('correctOptionIndex' in (parsedInProgress.questions[0] ?? {})).toBe(false);
    expect('solutionExplanation' in (parsedInProgress.questions[0] ?? {})).toBe(false);

    // completed batch
    const completedBatch = {
      tier: PracticeTier.EASY,
      status: BatchStatus.COMPLETED,
      score: 8,
      questions: fullQuestions,
      userAnswers: [1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
      completedAt: '2026-10-26T00:00:00.000Z',
    };

    const parsedCompleted = PracticeBatchDTOSchema.parse(completedBatch);
    expect(parsedCompleted.status).toBe('completed');
    expect(parsedCompleted.score).toBe(8);
    // Keys must be preserved
    expect('correctOptionIndex' in (parsedCompleted.questions[0] ?? {})).toBe(true);
    expect('solutionExplanation' in (parsedCompleted.questions[0] ?? {})).toBe(true);
    expect((parsedCompleted.questions[0] as typeof fullQuestions[0]).correctOptionIndex).toBe(1);
  });

  it('should validate PracticeBatchFullSchema and PracticeStateFullSchema', () => {
    const fullQuestions = Array.from({ length: MCQ_BATCH_SIZE }, (_, i) => createValidMcq(i + 1, 1));
    const fullBatch = PracticeBatchFullSchema.parse({
      tier: PracticeTier.EASY,
      status: BatchStatus.COMPLETED,
      score: 10,
      questions: fullQuestions,
      userAnswers: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      completedAt: '2026-10-26T00:00:00.000Z',
    });
    expect(fullBatch.score).toBe(10);
    expect(fullBatch.questions[0]?.correctOptionIndex).toBe(1);

    const fullState = PracticeStateFullSchema.parse({
      activeTier: PracticeTier.EASY,
      batches: {
        easy: fullBatch,
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
    });
    expect(fullState.activeTier).toBe('easy');
    expect(fullState.batches.easy.questions[0]?.correctOptionIndex).toBe(1);
  });

  it('should validate PracticeStateDTOSchema', () => {
    const stateDTO = PracticeStateDTOSchema.parse({
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
    });
    expect(stateDTO.batches.easy.status).toBe('not_started');
  });

  it('should validate QuizDraftStorageSchema for mid-quiz local persistence (Edge Case 5)', () => {
    // Array draft representation
    const arrayDraft = {
      sessionId: 'sess_12345',
      tier: PracticeTier.MEDIUM,
      selectedAnswers: [0, 2, null, 1, null, null, null, null, null, null],
      updatedAt: '2026-10-26T00:00:00.000Z',
    };
    expect(QuizDraftStorageSchema.safeParse(arrayDraft).success).toBe(true);

    // Record draft representation
    const recordDraft = {
      sessionId: 'sess_12345',
      tier: PracticeTier.MEDIUM,
      selectedAnswers: { '0': 1, '1': 3, '5': 2 },
      updatedAt: '2026-10-26T00:00:00.000Z',
    };
    expect(QuizDraftStorageSchema.safeParse(recordDraft).success).toBe(true);

    // Array with invalid answer index
    expect(
      QuizDraftStorageSchema.safeParse({
        ...arrayDraft,
        selectedAnswers: [0, 4, null, 1, null, null, null, null, null, null],
      }).success,
    ).toBe(false);
  });
});

describe('IMP-003: Session Schemas', () => {
  it('should enforce MAX_TOPIC_QUERY_LENGTH (300 chars) on CreateSessionRequestSchema', () => {
    expect(
      CreateSessionRequestSchema.safeParse({
        topicQuery: 'Distributed Consensus with Paxos and Raft',
        initialMode: LearningMode.EXPLAIN,
      }).success,
    ).toBe(true);

    // Too long (301 chars)
    expect(
      CreateSessionRequestSchema.safeParse({
        topicQuery: 'A'.repeat(MAX_TOPIC_QUERY_LENGTH + 1),
        initialMode: LearningMode.INTERACT,
      }).success,
    ).toBe(false);

    // Empty query rejected
    expect(
      CreateSessionRequestSchema.safeParse({
        topicQuery: '   ',
        initialMode: LearningMode.PRACTICE,
      }).success,
    ).toBe(false);
  });

  it('should validate SwitchModeRequestSchema for all 3 learning modes', () => {
    expect(SwitchModeRequestSchema.parse({ mode: 'explain' }).mode).toBe('explain');
    expect(SwitchModeRequestSchema.parse({ mode: 'interact' }).mode).toBe('interact');
    expect(SwitchModeRequestSchema.parse({ mode: 'practice' }).mode).toBe('practice');
    expect(SwitchModeRequestSchema.safeParse({ mode: 'invalid_mode' }).success).toBe(false);
  });

  it('should validate SessionSummaryDTOSchema', () => {
    const summary = {
      id: 'sess_999',
      topicQuery: 'Quantum Entanglement',
      normalizedTitle: 'Quantum Entanglement Basics',
      lastActiveMode: LearningMode.EXPLAIN,
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T01:00:00.000Z',
    };
    const parsed = SessionSummaryDTOSchema.parse(summary);
    expect(parsed.id).toBe('sess_999');
    expect(parsed.lastActiveMode).toBe('explain');
  });

  it('should validate full TopicSessionDTOSchema and automatically strip answers from in_progress batch', () => {
    const fullQuestions = Array.from({ length: MCQ_BATCH_SIZE }, (_, i) => ({
      questionNumber: i + 1,
      questionText: `Q${i + 1}`,
      options: ['A', 'B', 'C', 'D'],
      hint: 'Hint',
      solutionExplanation: `Explanation for Q${i + 1}`,
      correctOptionIndex: 2,
    }));

    const sessionPayload = {
      id: 'sess_full_1',
      userId: 'usr_abc',
      topicQuery: 'Dynamic Programming',
      normalizedTitle: 'Dynamic Programming Patterns',
      lastActiveMode: LearningMode.PRACTICE,
      explainState: {
        status: ExplainStatus.READY,
        currentStepIndex: 2,
        cards: [
          {
            stepNumber: 1,
            stepType: ExplainStepType.INTUITION,
            title: 'Intuition',
            contentMarkdown: 'Remember subproblems...',
            deepDives: [],
          },
          {
            stepNumber: 2,
            stepType: ExplainStepType.CORE_MECHANISM,
            title: 'Core Mechanism',
            contentMarkdown: 'State transitions and memoization...',
            deepDives: [],
          },
          {
            stepNumber: 3,
            stepType: ExplainStepType.EXAMPLE,
            title: 'Example',
            contentMarkdown: '0/1 Knapsack...',
            deepDives: [],
          },
          {
            stepNumber: 4,
            stepType: ExplainStepType.CHECK_FOR_UNDERSTANDING,
            title: 'CFU',
            contentMarkdown: 'What is optimal substructure?',
            checkQuestion: 'Define it.',
            checkAnswer: 'Optimal solution contains optimal solutions to subproblems.',
            deepDives: [],
          },
        ],
        suggestedSubTopics: [],
      },
      interactState: {
        status: InteractStatus.NOT_STARTED,
        activeMilestoneIndex: 0,
        strikeCount: 0,
        milestones: [],
        messages: [],
      },
      practiceState: {
        activeTier: PracticeTier.EASY,
        batches: {
          easy: {
            tier: PracticeTier.EASY,
            status: BatchStatus.IN_PROGRESS,
            score: null,
            questions: fullQuestions,
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
      },
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    };

    const parsed = TopicSessionDTOSchema.parse(sessionPayload);
    expect(parsed.id).toBe('sess_full_1');
    expect(parsed.practiceState.batches.easy.status).toBe('in_progress');
    // Confirm answer key masking on in_progress batch
    expect('correctOptionIndex' in (parsed.practiceState.batches.easy.questions[0] ?? {})).toBe(false);
    expect('solutionExplanation' in (parsed.practiceState.batches.easy.questions[0] ?? {})).toBe(false);
  });

  it('should validate TopicSessionFullSchema preserving correctOptionIndex in database state', () => {
    const fullQuestions = Array.from({ length: MCQ_BATCH_SIZE }, (_, i) => ({
      questionNumber: i + 1,
      questionText: `Q${i + 1}`,
      options: ['A', 'B', 'C', 'D'],
      hint: 'Hint',
      solutionExplanation: `Explanation for Q${i + 1}`,
      correctOptionIndex: 2,
    }));

    const sessionPayload = {
      id: 'sess_full_2',
      userId: 'usr_abc',
      topicQuery: 'Graph Theory',
      normalizedTitle: 'Graph Theory Foundations',
      lastActiveMode: LearningMode.PRACTICE,
      explainState: {
        status: ExplainStatus.READY,
        currentStepIndex: 0,
        cards: [
          {
            stepNumber: 1,
            stepType: ExplainStepType.INTUITION,
            title: 'Intuition',
            contentMarkdown: 'Vertices and edges...',
            deepDives: [],
          },
          {
            stepNumber: 2,
            stepType: ExplainStepType.CORE_MECHANISM,
            title: 'Core Mechanism',
            contentMarkdown: 'Adjacency list representation...',
            deepDives: [],
          },
          {
            stepNumber: 3,
            stepType: ExplainStepType.EXAMPLE,
            title: 'Example',
            contentMarkdown: 'DFS traversal...',
            deepDives: [],
          },
          {
            stepNumber: 4,
            stepType: ExplainStepType.CHECK_FOR_UNDERSTANDING,
            title: 'CFU',
            contentMarkdown: 'Is a tree a connected acyclic graph?',
            checkQuestion: 'Tree definition?',
            checkAnswer: 'Yes.',
            deepDives: [],
          },
        ],
        suggestedSubTopics: [],
      },
      interactState: {
        status: InteractStatus.NOT_STARTED,
        activeMilestoneIndex: 0,
        strikeCount: 0,
        milestones: [],
        messages: [],
      },
      practiceState: {
        activeTier: PracticeTier.EASY,
        batches: {
          easy: {
            tier: PracticeTier.EASY,
            status: BatchStatus.IN_PROGRESS,
            score: null,
            questions: fullQuestions,
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
      },
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    };

    const parsed = TopicSessionFullSchema.parse(sessionPayload);
    expect(parsed.id).toBe('sess_full_2');
    // On TopicSessionFullSchema, correctOptionIndex and solutionExplanation are preserved even when in_progress
    expect(parsed.practiceState.batches.easy.questions[0]?.correctOptionIndex).toBe(2);
    expect(parsed.practiceState.batches.easy.questions[0]?.solutionExplanation).toBe('Explanation for Q1');
  });
});
