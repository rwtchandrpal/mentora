import { Request, Response, NextFunction } from 'express';
import { UserProfileStateDTO, ErrorCode } from '@mentora/shared';
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../services/auth.service.js';
import { userRepository } from '../repositories/user.repository.js';
import { IUserDocument } from '../models/User.model.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        profile: UserProfileStateDTO;
      };
    }
  }
}

const toUserProfileDTO = (user: IUserDocument): UserProfileStateDTO => {
  if (
    user.profile.isCompleted &&
    user.profile.educationLevel &&
    user.profile.preferredStyle
  ) {
    return {
      isCompleted: true,
      educationLevel: user.profile.educationLevel,
      preferredStyle: user.profile.preferredStyle,
    };
  }
  return {
    isCompleted: false,
    educationLevel: null,
    preferredStyle: null,
  };
};

export const requireAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
    }

    const payload = verifyAccessToken(token);

    const user = await userRepository.findById(payload.sub);
    if (!user) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Account no longer exists');
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      profile: toUserProfileDTO(user),
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const authMiddleware = requireAuth;

export const requireCompletedProfile = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  try {
    if (!req.user) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
    }

    if (
      !req.user.profile.isCompleted ||
      !req.user.profile.educationLevel ||
      !req.user.profile.preferredStyle
    ) {
      throw new AppError(
        403,
        ErrorCode.PROFILE_INCOMPLETE,
        'Please complete your learner profile onboarding before accessing study sessions'
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const profileCompletedMiddleware = requireCompletedProfile;
