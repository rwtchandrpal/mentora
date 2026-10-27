import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { ErrorCode } from '@mentora/shared';
import { AppError } from '../utils/AppError.js';

export interface ValidationSchemas {
  body?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
}

export const validateRequest = (schemas: ValidationSchemas) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.params) {
        req.params = (await schemas.params.parseAsync(req.params)) as Record<string, string>;
      }
      if (schemas.query) {
        req.query = (await schemas.query.parseAsync(req.query)) as Record<
          string,
          string | string[] | undefined
        >;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid request payload', {
            issues: error.issues,
          })
        );
        return;
      }
      next(error);
    }
  };
};
