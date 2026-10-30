import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  EducationLevel,
  ExplanationStyle,
  RegisterRequestDTO,
  LoginRequestDTO,
  UserDTO,
  AuthResponseDataDTO,
  StaticLearnerProfileInputDTO,
  UserProfileStateDTO,
  ErrorCode,
  UserDTOSchema,
} from '@mentora/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { IUserDocument } from '../models/User.model.js';
import { userRepository, UserRepository } from '../repositories/user.repository.js';

export const DEMO_USER_CREDENTIALS = {
  name: 'Jhon (Demo Learner)',
  email: 'jhon@email.com',
  password: 'Jhon1234',
  educationLevel: EducationLevel.UNDERGRADUATE,
  preferredStyle: ExplanationStyle.CONCISE_TECHNICAL,
} as const;

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

export const verifyAccessToken = (token: string): { sub: string; email: string } => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
    });
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
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

  async ensureDemoUser(): Promise<IUserDocument> {
    const normalizedEmail = DEMO_USER_CREDENTIALS.email.toLowerCase().trim();
    const existing = await this.userRepo.findByEmailWithPassword(normalizedEmail);
    if (existing) {
      let needsSave = false;
      if (!existing.profile?.isCompleted) {
        existing.profile = {
          isCompleted: true,
          educationLevel: DEMO_USER_CREDENTIALS.educationLevel,
          preferredStyle: DEMO_USER_CREDENTIALS.preferredStyle,
        };
        needsSave = true;
      }
      const isMatch = await bcrypt.compare(
        DEMO_USER_CREDENTIALS.password,
        existing.passwordHash
      );
      if (!isMatch) {
        existing.passwordHash = await bcrypt.hash(DEMO_USER_CREDENTIALS.password, 12);
        needsSave = true;
      }
      if (needsSave) {
        await existing.save();
      }
      return existing;
    }

    const passwordHash = await bcrypt.hash(DEMO_USER_CREDENTIALS.password, 12);
    return this.userRepo.create({
      name: DEMO_USER_CREDENTIALS.name,
      email: normalizedEmail,
      passwordHash,
      profile: {
        isCompleted: true,
        educationLevel: DEMO_USER_CREDENTIALS.educationLevel,
        preferredStyle: DEMO_USER_CREDENTIALS.preferredStyle,
      },
    });
  }

  async login(input: LoginRequestDTO): Promise<AuthResponseDataDTO> {
    const normalizedEmail = input.email.toLowerCase().trim();
    let user = await this.userRepo.findByEmailWithPassword(normalizedEmail);
    if (!user && normalizedEmail === DEMO_USER_CREDENTIALS.email) {
      await this.ensureDemoUser();
      user = await this.userRepo.findByEmailWithPassword(normalizedEmail);
    }
    if (!user) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid email or password');
    }

    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
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

export const ensureDemoUser = async (): Promise<IUserDocument> => {
  return authService.ensureDemoUser();
};
