// [KO] 모든 에러를 { success: false, error: { code, message } } 형식으로 변환하는 공통 에러 미들웨어

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

// [KO] 에러 종류별로 status·code·message 결정
function resolve(err: unknown): ResolvedError {
  // [KO] 비즈니스 에러: AppError에 담긴 코드 그대로 사용
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message };
  }

  // [KO] 잘못된 JSON 본문은 400 VALIDATION_ERROR
  if (isBodyParseError(err)) {
    return {
      status: ERROR_CODES.VALIDATION_ERROR.status,
      code: 'VALIDATION_ERROR',
      message: err.message,
    };
  }

  // [KO] 예상 못 한 에러는 로그로만 남기고, 클라이언트에는 내부 정보를 숨긴 500 응답
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
