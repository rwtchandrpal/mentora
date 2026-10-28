import { Router } from 'express';
import {
  PracticeGenerateRequestSchema,
  PracticeSubmitRequestSchema,
} from '@mentora/shared';
import { practiceController } from '../controllers/practice.controller.js';
import {
  requireAuth,
  requireCompletedProfile,
} from '../middlewares/auth.middleware.js';
import { quotaMiddleware } from '../middlewares/quota.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const practiceRouter = Router();

practiceRouter.use(requireAuth, requireCompletedProfile);

practiceRouter.post(
  '/:id/practice/generate',
  quotaMiddleware,
  validateRequest({ body: PracticeGenerateRequestSchema }),
  asyncHandler(practiceController.generateBatch)
);

practiceRouter.post(
  '/:id/practice/submit',
  validateRequest({ body: PracticeSubmitRequestSchema }),
  asyncHandler(practiceController.submitBatch)
);

