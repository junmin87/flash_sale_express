// [KO] ADMIN_ENABLED=false면 관리자 API를 404로 숨기는 미들웨어

import type { RequestHandler } from 'express';
import { config } from '../../config/config.js';
import { AppError } from '../errors/app-error.js';

// Placed before validation, so a disabled admin API responds NOT_FOUND
// regardless of the request body
export const adminEnabled: RequestHandler = (_req, _res, next) => {
  if (!config.adminEnabled) throw new AppError('NOT_FOUND');
  next();
};
