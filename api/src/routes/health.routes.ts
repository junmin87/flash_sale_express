import { Router } from 'express';
import type { createHealthController } from '../controllers/health.controller.js';

export function createHealthRouter(
  controller: ReturnType<typeof createHealthController>,
): Router {
  const router = Router();
  router.get('/', controller.check);
  return router;
}
