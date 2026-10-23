// Business error created from an error code. The status and default message
// come from error-codes

import { ERROR_CODES, ErrorCode } from './error-codes.js';

export class AppError extends Error {
  readonly status: number;

  constructor(
    public readonly code: ErrorCode,
    message: string = ERROR_CODES[code].message,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = ERROR_CODES[code].status;
  }
}
