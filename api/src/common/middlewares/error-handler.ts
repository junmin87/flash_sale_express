import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import { ERROR_CODES, ErrorCode } from '../errors/error-codes.js';
import { log } from '../logger.js';

interface ResolvedError {
  status: number;
  code: ErrorCode;
  message: string;
}

// express.json() marks a malformed body with this type
function isBodyParseError(err: unknown): err is Error {
  return (
    err instanceof Error &&
    (err as Error & { type?: unknown }).type === 'entity.parse.failed'
  );
}

function resolve(err: unknown): ResolvedError {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message };
  }

  if (isBodyParseError(err)) {
    return {
      status: ERROR_CODES.VALIDATION_ERROR.status,
      code: 'VALIDATION_ERROR',
      message: err.message,
    };
  }

  log('error', err instanceof Error ? (err.stack ?? err.message) : String(err));
  return {
    status: ERROR_CODES.INTERNAL_ERROR.status,
    code: 'INTERNAL_ERROR',
    message: ERROR_CODES.INTERNAL_ERROR.message,
  };
}

// Express recognizes an error handler by its four parameters
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const { status, code, message } = resolve(err);
  res.status(status).json({ success: false, error: { code, message } });
};
