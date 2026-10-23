// Shared error middleware that turns every error into { success: false, error:
// { code, message } }

import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import { ERROR_CODES, ErrorCode } from '../errors/error-codes.js';
import { log } from '../logger.js';

interface ResolvedError {
  status: number;
  code: ErrorCode;
  message: string;
}

// express.json() marks body errors (malformed, too large, ...) with a string type and a 4xx status
function isBodyError(err: unknown): err is Error {
  if (!(err instanceof Error)) return false;
  const { type, status } = err as Error & { type?: unknown; status?: unknown };
  return (
    typeof type === 'string' &&
    typeof status === 'number' &&
    status >= 400 &&
    status <= 499
  );
}

// Picks the status, code and message for each kind of error
function resolve(err: unknown): ResolvedError {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message };
  }

  // Request body errors (invalid JSON, body too large, ...) are all 400
  // VALIDATION_ERROR
  if (isBodyError(err)) {
    return {
      status: ERROR_CODES.VALIDATION_ERROR.status,
      code: 'VALIDATION_ERROR',
      message: err.message,
    };
  }

  // Unexpected errors are only logged. The client gets a 500 without internal
  // details
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
