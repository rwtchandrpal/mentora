import { Router } from 'express';
import { quotaController } from '../controllers/quota.controller.js';
import { optionalAuth } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const quotaRouter = Router();

quotaRouter.get('/', optionalAuth, asyncHandler(quotaController.getQuota));
