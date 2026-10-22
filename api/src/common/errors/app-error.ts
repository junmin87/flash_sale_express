// [KO] 에러 코드로 생성하는 비즈니스 에러 클래스. status·기본 메시지는 error-codes에서 가져온다

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
