// [KO] GET /api/sale 라우트

import { Router } from 'express';
import type { createSaleController } from '../controllers/sale.controller.js';

export function createSaleRouter(
  controller: ReturnType<typeof createSaleController>,
): Router {
  const router = Router();
  router.get('/', controller.getSale);
  return router;
}
