// Middleware that hides the admin API with 404 when ADMIN_ENABLED=false

import type { RequestHandler } from 'express';
import { config } from '../../config/config.js';
import { AppError } from '../errors/app-error.js';

// Placed before validation, so a disabled admin API responds NOT_FOUND
// regardless of the request body
export const adminEnabled: RequestHandler = (_req, _res, next) => {
  if (!config.adminEnabled) throw new AppError('NOT_FOUND');
  next();
};
