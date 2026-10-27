import { Router } from 'express';
import { StaticLearnerProfileInputSchema } from '@mentora/shared';
import { profileController } from '../controllers/profile.controller.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const profileRouter = Router();

profileRouter.put(
  '/',
  requireAuth,
  validateRequest({ body: StaticLearnerProfileInputSchema }),
  asyncHandler(profileController.updateProfile)
);
