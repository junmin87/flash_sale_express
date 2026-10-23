// Service that initializes, reads and resets the sale settings (time and stock)
// in Redis. A factory function that takes Redis and the DB

import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { AppError } from '../common/errors/app-error.js';
import { log } from '../common/logger.js';
import { config } from '../config/config.js';
import { REDIS_KEYS } from '../infra/redis-keys.js';
import { SaleStatus, getSaleStatus } from '../sale/sale-status.js';
import type { SetSaleInput } from '../validators/sale.validator.js';

export interface SaleState {
  status: SaleStatus;
  startAt: string;
  endAt: string;
  stock: number;
  totalStock: number;
}

export type SaleService = ReturnType<typeof createSaleService>;

export function createSaleService({
  redis,
  pool,
}: {
  redis: Redis;
  pool: Pool;
}) {
  // MSETNX writes all keys or none, so concurrent or repeated boots never
  // overwrite a sale that is already configured
  async function initSale(): Promise<void> {
    const { startAt, endAt, stock } = config.sale;
    const written = await redis.msetnx(
      REDIS_KEYS.SALE_START_AT,
      startAt,
      REDIS_KEYS.SALE_END_AT,
      endAt,
      REDIS_KEYS.SALE_STOCK,
      stock,
      REDIS_KEYS.SALE_TOTAL_STOCK,
      stock,
    );
    if (written === 1) {
      log('info', 'Initialized sale settings in Redis');
    } else {
      log('info', 'Sale settings already exist in Redis, left unchanged');
    }
  }

  // Reads the sale settings and the Redis server time together to compute the
  // current status
  async function getSale(): Promise<SaleState> {
    const [values, time] = await Promise.all([
      redis.mget(
        REDIS_KEYS.SALE_START_AT,
        REDIS_KEYS.SALE_END_AT,
        REDIS_KEYS.SALE_STOCK,
        REDIS_KEYS.SALE_TOTAL_STOCK,
      ),
      redis.time(),
    ]);
    // If any key is missing, the sale is not configured, so respond with 503
    if (values.some((value) => value === null)) {
      throw new AppError('SERVICE_UNAVAILABLE');
    }
    const [startAt, endAt, stock, totalStock] = values.map(Number);
    // TIME replies with [seconds, microseconds]
    // Use the Redis server time, not the app server time, converted to ms
    const now = Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);

    return {
      status: getSaleStatus(now, startAt, endAt),
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      stock,
      totalStock,
    };
  }

  // Redis is reset before the database so that no queued order can be
  // persisted after the orders table is emptied
  // Admin reset: overwrite the sale settings in Redis, delete the buyers and
  // the order stream, then empty the orders table
  async function setSale(input: SetSaleInput): Promise<SaleState> {
    const results = await redis
      .multi()
      .mset(
        REDIS_KEYS.SALE_START_AT,
        Date.parse(input.startAt),
        REDIS_KEYS.SALE_END_AT,
        Date.parse(input.endAt),
        REDIS_KEYS.SALE_STOCK,
        input.stock,
        REDIS_KEYS.SALE_TOTAL_STOCK,
        input.stock,
      )
      // Delete the previous sale's buyers and unsaved order stream (in the same
      // MULTI)
      .del(REDIS_KEYS.SALE_BUYERS, REDIS_KEYS.ORDER_STREAM)
      .exec();
    // If exec returns null (aborted) or any command failed, throw without
    // touching the DB
    const failed = results?.find(([error]) => error !== null);
    if (!results || failed) {
      throw failed?.[0] ?? new Error('Redis transaction was aborted');
    }

    await pool.query('TRUNCATE TABLE orders');

    return getSale();
  }

  return { initSale, getSale, setSale };
}
