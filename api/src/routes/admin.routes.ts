// POST /api/admin/sale route (admin check -> validation -> controller)

import { Router } from 'express';
import { adminEnabled } from '../common/middlewares/admin-enabled.js';
import { validate } from '../common/middlewares/validate.js';
import type { createAdminController } from '../controllers/admin.controller.js';
import { setSaleSchema } from '../validators/sale.validator.js';

export function createAdminRouter(
  controller: ReturnType<typeof createAdminController>,
): Router {
  const router = Router();
  router.post(
    '/sale',
    adminEnabled,
    validate(setSaleSchema),
    controller.setSale,
  );
  return router;
}
