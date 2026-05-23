import { ZodSchema } from 'zod';
import { Request, Response, NextFunction } from 'express';

type Target = 'body' | 'query' | 'params';

function makeValidator(schema: ZodSchema, target: Target) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      res.status(400).json({
        error:   target === 'params' ? 'Invalid path parameter' : 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    // Replace with coerced / transformed values from Zod (e.g. coerce.number, .default())
    // Double-cast through unknown: Express Request lacks an index signature so a
    // direct cast to Record<string, unknown> fails strict TS checks.
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}

export const validateBody   = (schema: ZodSchema) => makeValidator(schema, 'body');
export const validateQuery  = (schema: ZodSchema) => makeValidator(schema, 'query');
export const validateParams = (schema: ZodSchema) => makeValidator(schema, 'params');
