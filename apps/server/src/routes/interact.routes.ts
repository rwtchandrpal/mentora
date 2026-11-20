import { Router } from 'express';
import { InteractStreamRequestSchema } from '@mentora/shared';
import { interactController } from '../controllers/interact.controller.js';
import { quotaMiddleware } from '../middlewares/quota.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const interactRouter = Router();

// Mounted only inside sessionRouter, which already runs optionalAuth,
// requireCompletedProfile and requireSessionAccess for every route here.
interactRouter.post(
  '/:id/interact/init',
  quotaMiddleware,
  asyncHandler(interactController.initInteract)
);

interactRouter.post(
  '/:id/interact/stream',
  quotaMiddleware,
  validateRequest({ body: InteractStreamRequestSchema }),
  asyncHandler(interactController.streamInteractTurn)
);

