import { Request, Response } from 'express';
import { AuthResponseDataDTO, UserDTO, ApiSuccessEnvelope } from '@mentora/shared';
import { authService, AuthService } from '../services/auth.service.js';

export class AuthController {
  constructor(private readonly service: AuthService = authService) {}

  register = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<AuthResponseDataDTO>>
  ): Promise<void> => {
    const data = await this.service.register(req.body);
    res.status(201).json({
      success: true,
      data,
    });
  };

  login = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<AuthResponseDataDTO>>
  ): Promise<void> => {
    const data = await this.service.login(req.body);
    res.status(200).json({
      success: true,
      data,
    });
  };

  getMe = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<UserDTO>>
  ): Promise<void> => {
    const data = await this.service.getMe(req.user!.id);
    res.status(200).json({
      success: true,
      data,
    });
  };
}

export const authController = new AuthController();
