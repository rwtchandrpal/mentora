import {
  DEFAULT_GUEST_PROFILE,
  EducationLevel,
  ErrorCode,
  ExplanationStyle,
  StaticLearnerProfile,
} from '@mentora/shared';
import { AppError } from '../utils/AppError.js';
import { UserRepository } from '../repositories/user.repository.js';

interface ProfileFields {
  isCompleted: boolean;
  educationLevel?: EducationLevel | null;
  preferredStyle?: ExplanationStyle | null;
}

/**
 * Who a service call is for (A-13):
 * - the authenticated user as already loaded by the auth middleware (`req.user`), so the
 *   service needs no extra `User` lookup;
 * - a bare user ID (scripts and service tests), which is looked up once;
 * - `undefined` for a guest.
 */
export type LearnerRef = string | { id: string; profile: ProfileFields } | undefined;

export const learnerIdOf = (learner: LearnerRef): string | undefined =>
  typeof learner === 'string' ? learner : learner?.id;

/**
 * Returns the learner's static profile for prompt building. Guests get the default
 * profile; users must have completed onboarding (BR-01), otherwise 403.
 */
export const resolveLearnerProfile = async (
  learner: LearnerRef,
  userRepo: Pick<UserRepository, 'findById'>
): Promise<StaticLearnerProfile> => {
  if (!learner) {
    return DEFAULT_GUEST_PROFILE;
  }

  const profile =
    typeof learner === 'string'
      ? (await userRepo.findById(learner))?.profile
      : learner.profile;

  if (!profile?.isCompleted || !profile.educationLevel || !profile.preferredStyle) {
    throw new AppError(403, ErrorCode.PROFILE_INCOMPLETE, 'Learner profile is incomplete.');
  }

  return {
    educationLevel: profile.educationLevel,
    preferredStyle: profile.preferredStyle,
  };
};
