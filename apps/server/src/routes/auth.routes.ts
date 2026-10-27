import { Router } from 'express';
import { RegisterRequestSchema, LoginRequestSchema } from '@mentora/shared';
import { authController } from '../controllers/auth.controller.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  validateRequest({ body: RegisterRequestSchema }),
  asyncHandler(authController.register)
);

authRouter.post(
  '/login',
  validateRequest({ body: LoginRequestSchema }),
  asyncHandler(authController.login)
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(authController.getMe)
);
