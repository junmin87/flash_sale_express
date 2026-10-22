// [KO] Joi 스키마로 req.body 또는 req.params를 검증하는 미들웨어 팩토리

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
    // [KO] 실패 메시지를 모두 합쳐 VALIDATION_ERROR로 던진다
    if (error) {
      throw new AppError(
        'VALIDATION_ERROR',
        error.details.map((detail) => detail.message).join(', '),
      );
    }
    // [KO] 검증·정리된 값(알 수 없는 필드 제거)으로 교체
    req[source] = value;
    next();
  };
}
