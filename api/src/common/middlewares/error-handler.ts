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

// [KO] 에러 종류별로 status·code·message 결정
function resolve(err: unknown): ResolvedError {
  // [KO] 비즈니스 에러: AppError에 담긴 코드 그대로 사용
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message };
  }

  // [KO] 요청 본문 에러(잘못된 JSON, 너무 큰 본문 등)는 전부 400 VALIDATION_ERROR
  if (isBodyError(err)) {
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
