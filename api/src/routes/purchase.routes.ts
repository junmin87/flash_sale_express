// POST /api/purchases and GET /api/purchases/:userId routes (validation ->
// controller)

import { Router } from 'express';
import { validate } from '../common/middlewares/validate.js';
import type { createPurchaseController } from '../controllers/purchase.controller.js';
import { userIdSchema } from '../validators/purchase.validator.js';

export function createPurchaseRouter(
  controller: ReturnType<typeof createPurchaseController>,
): Router {
  const router = Router();
  router.post('/', validate(userIdSchema), controller.purchase);
  router.get(
    '/:userId',
    validate(userIdSchema, 'params'),
    controller.getPurchase,
  );
  return router;
}
