// Middleware factory that validates req.body or req.params with a Joi schema

import type { RequestHandler } from 'express';
import type { ObjectSchema } from 'joi';
import { AppError } from '../errors/app-error.js';

type ValidationSource = 'body' | 'params';

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Validates req.body (default) or req.params, reports every failure at once
// and drops unknown fields
export function validate(
  schema: ObjectSchema,
  source: ValidationSource = 'body',
): RequestHandler {
  return (req, _res, next) => {
    // A missing or non-object body is validated as an empty object
    const input: unknown = isObject(req[source]) ? req[source] : {};
    const { error, value } = schema.validate(input, {
      abortEarly: false,
      stripUnknown: true,
    });
    // Join all failure messages into one VALIDATION_ERROR
    if (error) {
      throw new AppError(
        'VALIDATION_ERROR',
        error.details.map((detail) => detail.message).join(', '),
      );
    }
    // Replace with the validated value (unknown fields removed)
    req[source] = value;
    next();
  };
}
