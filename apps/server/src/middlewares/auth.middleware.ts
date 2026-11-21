import { Request, Response, NextFunction } from 'express';
import { UserProfileStateDTO, ErrorCode, GUEST_TOKEN_HEADER } from '@mentora/shared';
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken, verifyGuestToken } from '../services/auth.service.js';
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
      /** Set when an unauthenticated request carries a valid guest token. */
      guest?: {
        sessionId: string;
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

const attachGuestIdentity = (req: Request): void => {
  const rawGuestToken = req.get(GUEST_TOKEN_HEADER);
  if (!rawGuestToken) {
    return;
  }
  const sessionId = verifyGuestToken(rawGuestToken.trim());
  if (sessionId) {
    req.guest = { sessionId };
  }
};

export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    req.user = undefined;
    req.guest = undefined;

    const authHeader = req.headers.authorization;
    const token =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      attachGuestIdentity(req);
      return next();
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
      return next();
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

/**
 * Guards every `/sessions/:id/...` route for unauthenticated callers: a guest may only
 * touch the single session its guest token was issued for. Authenticated users pass
 * through; their ownership is enforced by the userId filter in the repository.
 *
 * - no user and no valid guest token -> 401
 * - valid guest token for a different session -> 404 (does not reveal whether the ID exists)
 */
export const requireSessionAccess = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (req.user) {
    return next();
  }

  if (!req.guest) {
    return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required'));
  }

  const rawId = req.params.id;
  const sessionId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!sessionId || sessionId !== req.guest.sessionId) {
    return next(
      new AppError(404, ErrorCode.RESOURCE_NOT_FOUND, 'Topic session not found')
    );
  }

  next();
};
