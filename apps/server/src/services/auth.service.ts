import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  RegisterRequestDTO,
  LoginRequestDTO,
  UserDTO,
  AuthResponseDataDTO,
  StaticLearnerProfileInputDTO,
  UserProfileStateDTO,
  ErrorCode,
  UserDTOSchema,
  GUEST_SESSION_TTL_SECONDS,
} from '@mentora/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { IUserDocument } from '../models/User.model.js';
import { userRepository, UserRepository } from '../repositories/user.repository.js';

export const toUserDTO = (userDoc: IUserDocument): UserDTO => {
  const profileDto: UserProfileStateDTO = userDoc.profile.isCompleted
    ? {
        isCompleted: true,
        educationLevel: userDoc.profile.educationLevel!,
        preferredStyle: userDoc.profile.preferredStyle!,
      }
    : {
        isCompleted: false,
        educationLevel: null,
        preferredStyle: null,
      };

  const dto: UserDTO = {
    id: userDoc._id.toString(),
    _id: userDoc._id.toString(),
    name: userDoc.name,
    email: userDoc.email,
    profile: profileDto,
    usageQuota: {
      dailyCount: userDoc.usageQuota.dailyCount,
      dailyLimit: env.DAILY_AI_QUOTA_LIMIT,
      windowResetAt: userDoc.usageQuota.windowResetAt.toISOString(),
    },
    createdAt: userDoc.createdAt ? userDoc.createdAt.toISOString() : undefined,
    updatedAt: userDoc.updatedAt ? userDoc.updatedAt.toISOString() : undefined,
  };

  return UserDTOSchema.parse(dto);
};

export const signAccessToken = (payload: { sub: string; email: string }): string => {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
};

const GUEST_TOKEN_TYPE = 'guest';

/**
 * Signs a stateless access token that grants a guest access to exactly one
 * ephemeral session. It expires together with the session's TTL.
 */
export const signGuestToken = (sessionId: string): string => {
  return jwt.sign({ sid: sessionId, typ: GUEST_TOKEN_TYPE }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: GUEST_SESSION_TTL_SECONDS,
  });
};

/**
 * Returns the session ID a guest token grants access to, or null when the token
 * is missing, malformed, expired, or not a guest token.
 */
export const verifyGuestToken = (token: string): string | null => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      decoded.typ !== GUEST_TOKEN_TYPE ||
      typeof decoded.sid !== 'string' ||
      decoded.sid.length === 0
    ) {
      return null;
    }
    return decoded.sid;
  } catch {
    return null;
  }
};

export const verifyAccessToken = (token: string): { sub: string; email: string } => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
    });
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      decoded.typ === GUEST_TOKEN_TYPE ||
      !('sub' in decoded) ||
      !('email' in decoded)
    ) {
      throw new Error('Invalid token payload');
    }
    return { sub: String(decoded.sub), email: String(decoded.email) };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      401,
      ErrorCode.UNAUTHORIZED,
      'Invalid or expired authentication token'
    );
  }
};

/**
 * Valid bcrypt hash (cost 12) of a random throwaway string. Login compares
 * against it when the email is unknown, so response time doesn't reveal
 * whether an account exists (A-28).
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('mentora-timing-equalizer', 12);

export class AuthService {
  constructor(private readonly userRepo: UserRepository = userRepository) {}

  async register(input: RegisterRequestDTO): Promise<AuthResponseDataDTO> {
    const normalizedEmail = input.email.toLowerCase().trim();
    const existing = await this.userRepo.findByEmail(normalizedEmail);
    if (existing) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'An account with this email already exists'
      );
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    let user: IUserDocument;
    try {
      user = await this.userRepo.create({
        name: input.name.trim(),
        email: normalizedEmail,
        passwordHash,
      });
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: number }).code === 11000
      ) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'An account with this email already exists'
        );
      }
      throw err;
    }

    const token = signAccessToken({
      sub: user._id.toString(),
      email: user.email,
    });

    return {
      token,
      user: toUserDTO(user),
    };
  }

  async login(input: LoginRequestDTO): Promise<AuthResponseDataDTO> {
    const normalizedEmail = input.email.toLowerCase().trim();
    const user = await this.userRepo.findByEmailWithPassword(normalizedEmail);
    // Always pay the bcrypt cost, even for unknown emails (A-28).
    const isMatch = await bcrypt.compare(
      input.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH
    );
    if (!user || !isMatch) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid email or password');
    }

    const token = signAccessToken({
      sub: user._id.toString(),
      email: user.email,
    });

    return {
      token,
      user: toUserDTO(user),
    };
  }

  async getMe(userId: string): Promise<UserDTO> {
    const refreshed = await this.userRepo.resetQuotaWindowIfNeeded(userId);
    const user = refreshed ?? (await this.userRepo.findById(userId));
    if (!user) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'User account not found');
    }
    return toUserDTO(user);
  }

  async updateProfile(
    userId: string,
    input: StaticLearnerProfileInputDTO
  ): Promise<UserDTO> {
    const updated = await this.userRepo.updateProfile(userId, input);
    if (!updated) {
      throw new AppError(404, ErrorCode.RESOURCE_NOT_FOUND, 'User not found');
    }
    return toUserDTO(updated);
  }
}

export const authService = new AuthService();
