import { describe, it, expect } from 'vitest';
import {
  // Constants
  DAILY_AI_QUOTA_LIMIT,
  MAX_SOCRATIC_STRIKES,
  MCQ_BATCH_SIZE,
  MCQ_OPTIONS_COUNT,
  EXPLAIN_CORE_STEPS_COUNT,
  MIN_INTERACT_MILESTONES,
  MAX_INTERACT_MILESTONES,
  MAX_TOPIC_QUERY_LENGTH,
  MAX_INTERACT_MESSAGE_LENGTH,
  MAX_DEEP_DIVE_DEPTH,
  MIN_USER_NAME_LENGTH,
  MAX_USER_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  // Enums
  EducationLevel,
  EDUCATION_LEVELS,
  ExplanationStyle,
  EXPLANATION_STYLES,
  LearningMode,
  LEARNING_MODES,
  PracticeTier,
  PRACTICE_TIERS,
  BatchStatus,
  BATCH_STATUSES,
  MilestoneStatus,
  MILESTONE_STATUSES,
  ErrorCode,
  ERROR_CODES,
  // Schemas
  EducationLevelSchema,
  ExplanationStyleSchema,
  StaticLearnerProfileInputSchema,
  UserProfileStateSchema,
  QuotaMetaSchema,
  UsageQuotaDTOSchema,
  RegisterRequestSchema,
  LoginRequestSchema,
  UserDTOSchema,
  AuthResponseDataSchema,
  ErrorCodeSchema,
  ApiErrorEnvelopeSchema,
  createApiSuccessEnvelopeSchema,
} from '../index.js';

describe('IMP-002: Domain Enums and Business Rule Constants', () => {
  it('should verify all business constants match exact specification values', () => {
    expect(DAILY_AI_QUOTA_LIMIT).toBe(50);
    expect(MAX_SOCRATIC_STRIKES).toBe(3);
    expect(MCQ_BATCH_SIZE).toBe(10);
    expect(MCQ_OPTIONS_COUNT).toBe(4);
    expect(EXPLAIN_CORE_STEPS_COUNT).toBe(4);
    expect(MIN_INTERACT_MILESTONES).toBe(3);
    expect(MAX_INTERACT_MILESTONES).toBe(5);
    expect(MAX_TOPIC_QUERY_LENGTH).toBe(300);
    expect(MAX_INTERACT_MESSAGE_LENGTH).toBe(2000);
    expect(MAX_DEEP_DIVE_DEPTH).toBe(2);
    expect(MIN_USER_NAME_LENGTH).toBe(2);
    expect(MAX_USER_NAME_LENGTH).toBe(80);
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(MAX_PASSWORD_LENGTH).toBe(128);
  });

  it('should verify all domain enums contain expected members', () => {
    expect(EDUCATION_LEVELS).toEqual(['high_school', 'undergraduate', 'professional']);
    expect(EXPLANATION_STYLES).toEqual(['visual', 'analogy_heavy', 'concise_technical']);
    expect(LEARNING_MODES).toEqual(['explain', 'interact', 'practice']);
    expect(PRACTICE_TIERS).toEqual(['easy', 'medium', 'hard']);
    expect(BATCH_STATUSES).toEqual(['locked', 'not_started', 'in_progress', 'completed']);
    expect(MILESTONE_STATUSES).toEqual(['pending', 'active', 'completed']);
    expect(ERROR_CODES).toEqual([
      'VALIDATION_ERROR',
      'UNAUTHORIZED',
      'PROFILE_INCOMPLETE',
      'RESOURCE_NOT_FOUND',
      'TIER_LOCKED',
      'EDUCATIONAL_GUARDRAIL_REFUSAL',
      'DAILY_QUOTA_EXCEEDED',
      'AI_UPSTREAM_FAILURE',
      'STREAM_INTERRUPTED',
      'INTERNAL_SERVER_ERROR',
    ]);

    expect(LearningMode.EXPLAIN).toBe('explain');
    expect(PracticeTier.EASY).toBe('easy');
    expect(BatchStatus.LOCKED).toBe('locked');
    expect(MilestoneStatus.PENDING).toBe('pending');
    expect(EducationLevelSchema.parse('high_school')).toBe('high_school');
    expect(ExplanationStyleSchema.parse('visual')).toBe('visual');
    expect(ErrorCodeSchema.parse('VALIDATION_ERROR')).toBe('VALIDATION_ERROR');
  });
});

describe('IMP-002: StaticLearnerProfile and UserProfileState Schemas', () => {
  it('should accept all valid 9 combinations of EducationLevel and ExplanationStyle', () => {
    for (const educationLevel of EDUCATION_LEVELS) {
      for (const preferredStyle of EXPLANATION_STYLES) {
        const result = StaticLearnerProfileInputSchema.safeParse({
          educationLevel,
          preferredStyle,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.educationLevel).toBe(educationLevel);
          expect(result.data.preferredStyle).toBe(preferredStyle);
        }
      }
    }
  });

  it('should reject invalid strings, missing fields, or null in StaticLearnerProfileInputSchema', () => {
    expect(
      StaticLearnerProfileInputSchema.safeParse({
        educationLevel: 'middle_school',
        preferredStyle: 'visual',
      }).success,
    ).toBe(false);

    expect(
      StaticLearnerProfileInputSchema.safeParse({
        educationLevel: 'undergraduate',
        preferredStyle: 'humorous',
      }).success,
    ).toBe(false);

    expect(
      StaticLearnerProfileInputSchema.safeParse({
        educationLevel: null,
        preferredStyle: 'visual',
      }).success,
    ).toBe(false);

    expect(
      StaticLearnerProfileInputSchema.safeParse({
        educationLevel: 'high_school',
      }).success,
    ).toBe(false);
  });

  it('should validate UserProfileStateSchema for newly registered users with null profiles (BR-01)', () => {
    const incompleteProfile = {
      isCompleted: false,
      educationLevel: null,
      preferredStyle: null,
    };
    const result = UserProfileStateSchema.safeParse(incompleteProfile);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isCompleted).toBe(false);
      expect(result.data.educationLevel).toBeNull();
      expect(result.data.preferredStyle).toBeNull();
    }
  });

  it('should validate UserProfileStateSchema for completed onboarding profiles', () => {
    const completedProfile = {
      isCompleted: true,
      educationLevel: 'undergraduate',
      preferredStyle: 'concise_technical',
    };
    const result = UserProfileStateSchema.safeParse(completedProfile);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isCompleted).toBe(true);
      expect(result.data.educationLevel).toBe('undergraduate');
      expect(result.data.preferredStyle).toBe('concise_technical');
    }
  });

  it('should reject UserProfileStateSchema when isCompleted is true but fields are null', () => {
    const invalidProfile1 = {
      isCompleted: true,
      educationLevel: null,
      preferredStyle: 'visual',
    };
    expect(UserProfileStateSchema.safeParse(invalidProfile1).success).toBe(false);

    const invalidProfile2 = {
      isCompleted: true,
      educationLevel: 'high_school',
      preferredStyle: null,
    };
    expect(UserProfileStateSchema.safeParse(invalidProfile2).success).toBe(false);
  });

  it('should validate QuotaMetaSchema and UsageQuotaDTOSchema', () => {
    const validMeta = {
      used: 12,
      limit: 50,
      resetAt: '2026-10-25T00:00:00.000Z',
    };
    expect(QuotaMetaSchema.safeParse(validMeta).success).toBe(true);

    // Negative used is invalid
    expect(QuotaMetaSchema.safeParse({ ...validMeta, used: -1 }).success).toBe(false);
    // Invalid datetime is invalid
    expect(QuotaMetaSchema.safeParse({ ...validMeta, resetAt: 'not-a-date' }).success).toBe(false);

    const validUsageQuota = {
      dailyCount: 5,
      dailyLimit: 50,
      windowResetAt: '2026-10-25T00:00:00.000Z',
    };
    const parsedQuota = UsageQuotaDTOSchema.parse(validUsageQuota);
    expect(parsedQuota.dailyCount).toBe(5);
    expect(parsedQuota.dailyLimit).toBe(50);

    // Default dailyLimit check
    const defaultQuota = UsageQuotaDTOSchema.parse({
      dailyCount: 0,
      windowResetAt: '2026-10-25T00:00:00.000Z',
    });
    expect(defaultQuota.dailyLimit).toBe(DAILY_AI_QUOTA_LIMIT);
  });
});

describe('IMP-002: Auth Request and UserDTO Schemas', () => {
  it('should trim and lowercase email in RegisterRequestSchema', () => {
    const raw = {
      name: '  Ada Lovelace  ',
      email: '  Ada.Lovelace@Example.COM  ',
      password: 'securePassword123',
    };
    const parsed = RegisterRequestSchema.parse(raw);
    expect(parsed.name).toBe('Ada Lovelace');
    expect(parsed.email).toBe('ada.lovelace@example.com');
    expect(parsed.password).toBe('securePassword123');
  });

  it('should enforce name length bounds (2 to 80 chars) in RegisterRequestSchema', () => {
    expect(
      RegisterRequestSchema.safeParse({
        name: 'A',
        email: 'test@example.com',
        password: 'password123',
      }).success,
    ).toBe(false);

    expect(
      RegisterRequestSchema.safeParse({
        name: 'A'.repeat(81),
        email: 'test@example.com',
        password: 'password123',
      }).success,
    ).toBe(false);

    expect(
      RegisterRequestSchema.safeParse({
        name: 'Bo',
        email: 'test@example.com',
        password: 'password123',
      }).success,
    ).toBe(true);
  });

  it('should enforce password minimum length (8 chars) in RegisterRequestSchema', () => {
    expect(
      RegisterRequestSchema.safeParse({
        name: 'Valid Name',
        email: 'test@example.com',
        password: 'short',
      }).success,
    ).toBe(false);

    expect(
      RegisterRequestSchema.safeParse({
        name: 'Valid Name',
        email: 'test@example.com',
        password: 'pass1234',
      }).success,
    ).toBe(true);
  });

  it('should validate LoginRequestSchema and trim/lowercase email', () => {
    const raw = {
      email: '  Learner@Domain.Org  ',
      password: 'password123',
    };
    const parsed = LoginRequestSchema.parse(raw);
    expect(parsed.email).toBe('learner@domain.org');
    expect(parsed.password).toBe('password123');

    // Empty password rejected
    expect(LoginRequestSchema.safeParse({ email: 'learner@domain.org', password: '' }).success).toBe(
      false,
    );
  });

  it('should validate complete UserDTOSchema and AuthResponseDataSchema', () => {
    const userPayload = {
      id: 'usr_1234567890',
      name: 'Alan Turing',
      email: 'alan@turing.org',
      profile: {
        isCompleted: false,
        educationLevel: null,
        preferredStyle: null,
      },
      usageQuota: {
        dailyCount: 0,
        dailyLimit: 50,
        windowResetAt: '2026-10-25T00:00:00.000Z',
      },
      createdAt: '2026-10-25T00:00:00.000Z',
      updatedAt: '2026-10-25T00:00:00.000Z',
    };

    const user = UserDTOSchema.parse(userPayload);
    expect(user.id).toBe('usr_1234567890');
    expect(user.profile.isCompleted).toBe(false);

    const authResponse = AuthResponseDataSchema.parse({
      token: 'jwt.sample.token',
      user: userPayload,
    });
    expect(authResponse.token).toBe('jwt.sample.token');
    expect(authResponse.user.name).toBe('Alan Turing');
  });
});

describe('IMP-002: API Envelope Schemas', () => {
  it('should validate ApiErrorEnvelopeSchema with ErrorCode and details', () => {
    const quotaError = {
      success: false,
      error: {
        code: ErrorCode.DAILY_QUOTA_EXCEEDED,
        message: 'Daily quota exceeded. You can review saved sessions.',
        details: { resetAt: '2026-10-25T00:00:00.000Z' },
      },
    };
    const parsed = ApiErrorEnvelopeSchema.parse(quotaError);
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('DAILY_QUOTA_EXCEEDED');
    expect(parsed.error.details?.resetAt).toBe('2026-10-25T00:00:00.000Z');
  });

  it('should reject invalid error code in ApiErrorEnvelopeSchema', () => {
    const badError = {
      success: false,
      error: {
        code: 'INVALID_UNKNOWN_CODE',
        message: 'Something went wrong',
      },
    };
    expect(ApiErrorEnvelopeSchema.safeParse(badError).success).toBe(false);
  });

  it('should validate typed success envelopes using createApiSuccessEnvelopeSchema', () => {
    const UserResponseSchema = createApiSuccessEnvelopeSchema(UserDTOSchema);
    const successPayload = {
      success: true,
      data: {
        id: 'usr_abc123',
        name: 'Marie Curie',
        email: 'marie@curie.org',
        profile: {
          isCompleted: true,
          educationLevel: EducationLevel.PROFESSIONAL,
          preferredStyle: ExplanationStyle.VISUAL,
        },
        usageQuota: {
          dailyCount: 3,
          dailyLimit: 50,
          windowResetAt: '2026-10-25T00:00:00.000Z',
        },
      },
      meta: {
        quota: {
          used: 3,
          limit: 50,
          resetAt: '2026-10-25T00:00:00.000Z',
        },
      },
    };

    const parsed = UserResponseSchema.parse(successPayload);
    expect(parsed.success).toBe(true);
    expect(parsed.data.name).toBe('Marie Curie');
    expect(parsed.meta?.quota?.used).toBe(3);
  });
});
