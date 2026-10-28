import { Router } from 'express';
import { InteractStreamRequestSchema } from '@mentora/shared';
import { interactController } from '../controllers/interact.controller.js';
import {
  requireAuth,
  requireCompletedProfile,
} from '../middlewares/auth.middleware.js';
import { quotaMiddleware } from '../middlewares/quota.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const interactRouter = Router();

interactRouter.use(requireAuth, requireCompletedProfile);

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

