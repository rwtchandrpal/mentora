import { Router } from 'express';
import {
  PracticeGenerateRequestSchema,
  PracticeSubmitRequestSchema,
} from '@mentora/shared';
import { practiceController } from '../controllers/practice.controller.js';
import { quotaMiddleware } from '../middlewares/quota.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const practiceRouter = Router();

// Mounted only inside sessionRouter, which already runs optionalAuth,
// requireCompletedProfile and requireSessionAccess for every route here.
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

