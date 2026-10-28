import { Router } from 'express';
import {
  ExplainStepRequestSchema,
  ExplainDeeperRequestSchema,
} from '@mentora/shared';
import { explainController } from '../controllers/explain.controller.js';
import {
  requireAuth,
  requireCompletedProfile,
} from '../middlewares/auth.middleware.js';
import { quotaMiddleware } from '../middlewares/quota.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const explainRouter = Router();

explainRouter.use(requireAuth, requireCompletedProfile);

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

explainRouter.post(
  '/:id/explain/deeper',
  quotaMiddleware,
  validateRequest({ body: ExplainDeeperRequestSchema }),
  asyncHandler(explainController.deeperExplain)
);

