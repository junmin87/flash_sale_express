import type { RequestHandler } from 'express';
import type { ObjectSchema } from 'joi';
import { AppError } from '../errors/app-error.js';

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Validates req.body, reports every failure at once and drops unknown fields
export function validate(schema: ObjectSchema): RequestHandler {
  return (req, _res, next) => {
    // A missing or non-object body is validated as an empty object
    const body: unknown = isObject(req.body) ? req.body : {};
    const { error, value } = schema.validate(body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      throw new AppError(
        'VALIDATION_ERROR',
        error.details.map((detail) => detail.message).join(', '),
      );
    }
    req.body = value;
    next();
  };
}
