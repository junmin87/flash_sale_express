import express, { Express } from 'express';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { AppError } from './common/errors/app-error.js';
import { errorHandler } from './common/middlewares/error-handler.js';
import { createAdminController } from './controllers/admin.controller.js';
import { createHealthController } from './controllers/health.controller.js';
import { createSaleController } from './controllers/sale.controller.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createSaleRouter } from './routes/sale.routes.js';
import { createSaleService } from './services/sale.service.js';

export function createApp({
  redis,
  pool,
}: {
  redis: Redis;
  pool: Pool;
}): Express {
  const saleService = createSaleService({ redis, pool });

  const app = express();
  app.use(express.json());

  app.use(
    '/api/health',
    createHealthRouter(createHealthController({ redis, pool })),
  );
  app.use('/api/sale', createSaleRouter(createSaleController(saleService)));
  app.use(
    '/api/admin',
    createAdminRouter(createAdminController(saleService)),
  );
  app.use('/api', (req, _res, next) => {
    next(new AppError('NOT_FOUND', `Cannot ${req.method} ${req.originalUrl}`));
  });

  app.use(errorHandler);
  return app;
}
