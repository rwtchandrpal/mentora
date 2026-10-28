import { Router } from 'express';
import {
  CreateSessionRequestSchema,
  SwitchModeRequestSchema,
} from '@mentora/shared';
import { sessionController } from '../controllers/session.controller.js';
import { explainRouter } from './explain.routes.js';
import { practiceRouter } from './practice.routes.js';
import { requireAuth, requireCompletedProfile } from '../middlewares/auth.middleware.js';
import { quotaMiddleware } from '../middlewares/quota.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const sessionRouter = Router();

sessionRouter.use(requireAuth, requireCompletedProfile);

sessionRouter.get('/', asyncHandler(sessionController.listSessions));

sessionRouter.post(
  '/',
  quotaMiddleware,
  validateRequest({ body: CreateSessionRequestSchema }),
  asyncHandler(sessionController.createSession)
);

sessionRouter.get('/:id', asyncHandler(sessionController.getSessionById));

sessionRouter.patch(
  '/:id/mode',
  validateRequest({ body: SwitchModeRequestSchema }),
  asyncHandler(sessionController.switchMode)
);

sessionRouter.delete('/:id', asyncHandler(sessionController.deleteSession));

sessionRouter.use(explainRouter);
sessionRouter.use(practiceRouter);
