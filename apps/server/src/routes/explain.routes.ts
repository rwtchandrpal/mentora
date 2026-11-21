import { Router } from 'express';
import { ExplainStepRequestSchema } from '@mentora/shared';
import { explainController } from '../controllers/explain.controller.js';
import { quotaMiddleware } from '../middlewares/quota.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const explainRouter = Router();

// Mounted only inside sessionRouter, which already runs optionalAuth,
// requireCompletedProfile and requireSessionAccess for every route here.
explainRouter.post(
  '/:id/explain/init',
  quotaMiddleware,
  asyncHandler(explainController.initExplain)
);

explainRouter.patch(
  '/:id/explain/step',
  validateRequest({ body: ExplainStepRequestSchema }),
  asyncHandler(explainController.stepExplain)
);

