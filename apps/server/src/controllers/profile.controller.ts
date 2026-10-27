import { Request, Response } from 'express';
import { UserDTO, ApiSuccessEnvelope } from '@mentora/shared';
import { authService, AuthService } from '../services/auth.service.js';

export class ProfileController {
  constructor(private readonly service: AuthService = authService) {}

  updateProfile = async (
    req: Request,
    res: Response<ApiSuccessEnvelope<UserDTO>>
  ): Promise<void> => {
    const data = await this.service.updateProfile(req.user!.id, req.body);
    res.status(200).json({
      success: true,
      data,
    });
  };
}

export const profileController = new ProfileController();
