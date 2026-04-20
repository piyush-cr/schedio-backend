// validateRequest.ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';

interface ValidationTargets {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validateRequest(targets: ValidationTargets) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (targets.body) {
        req.body = targets.body.parse(req.body);
      }
      if (targets.query) {
        req.query = targets.query.parse(req.query);
      }
      if (targets.params) {
        req.params = targets.params.parse(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        // ✅ next() instead of throw — lets Express error handler pick it up
        return next(new ApiError('Validation error', 400, errors));
      }
      next(error);
    }
  };
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return validateRequest({ body: schema });
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return validateRequest({ query: schema });
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return validateRequest({ params: schema });
}