// Shared integration test setup: real Redis and PostgreSQL connections, reset
// before each test, sale setup and worker draining

import { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { config } from '../src/config/config.js';
import { createPool } from '../src/infra/database.js';
import { createRedisClient } from '../src/infra/redis.js';
import { REDIS_KEYS } from '../src/infra/redis-keys.js';
import type { OrderWorker } from '../src/workers/order.worker.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// The offline queue is disabled, so commands fail before ready. Wait for it
async function ready(redis: Redis): Promise<Redis> {
  if (redis.status !== 'ready') {
    await new Promise<void>((resolve, reject) => {
      redis.once('ready', resolve);
      redis.once('error', reject);
    });
  }
  return redis;
}

// Creates real clients: an API Redis client (with the purchase script) and a
// worker Redis client (no commandTimeout, like src/worker.ts)
export async function connect(): Promise<{
  redis: Redis;
  workerRedis: Redis;
  pool: Pool;
}> {
  const redis = await ready(createRedisClient());
  const workerRedis = await ready(
    new Redis({
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db,
      enableOfflineQueue: false,
    }),
  );
  return { redis, workerRedis, pool: createPool() };
}

export async function disconnect({
  redis,
  workerRedis,
  pool,
}: {
  redis: Redis;
  workerRedis: Redis;
  pool: Pool;
}): Promise<void> {
  await redis.quit();
  await workerRedis.quit();
  await pool.end();
}

// Deletes the sale keys (the consumer group goes away with the stream) and
// empties orders
export async function resetState(redis: Redis, pool: Pool): Promise<void> {
  await redis.del(
    REDIS_KEYS.SALE_START_AT,
    REDIS_KEYS.SALE_END_AT,
    REDIS_KEYS.SALE_STOCK,
    REDIS_KEYS.SALE_TOTAL_STOCK,
    REDIS_KEYS.SALE_BUYERS,
    REDIS_KEYS.ORDER_STREAM,
  );
  await pool.query('TRUNCATE TABLE orders');
}

export type SaleWindow = 'active' | 'upcoming' | 'ended';

// Writes the sale window and stock to Redis directly. Times are far from the
// boundaries so clock differences do not matter
export async function setSale(
  redis: Redis,
  window: SaleWindow,
  stock: number,
): Promise<void> {
  const now = Date.now();
  const [startAt, endAt] = {
    active: [now - MINUTE_MS, now + HOUR_MS],
    upcoming: [now + HOUR_MS, now + 2 * HOUR_MS],
    ended: [now - 2 * HOUR_MS, now - HOUR_MS],
  }[window];
  await redis.mset(
    REDIS_KEYS.SALE_START_AT,
    startAt,
    REDIS_KEYS.SALE_END_AT,
    endAt,
    REDIS_KEYS.SALE_STOCK,
    stock,
    REDIS_KEYS.SALE_TOTAL_STOCK,
    stock,
  );
}

// Pending and lag of the consumer group (null if there is no group)
export async function groupInfo(
  redis: Redis,
): Promise<{ pending: number; lag: number | null } | null> {
  if (!(await redis.exists(REDIS_KEYS.ORDER_STREAM))) return null;
  // XINFO GROUPS replies with one flat [field, value, ...] array per group
  const groups = (await redis.xinfo(
    'GROUPS',
    REDIS_KEYS.ORDER_STREAM,
  )) as unknown[][];
  for (const fields of groups) {
    const info: Record<string, unknown> = {};
    for (let i = 0; i < fields.length; i += 2) {
      info[String(fields[i])] = fields[i + 1];
    }
    if (info.name === REDIS_KEYS.ORDER_GROUP) {
      return {
        pending: Number(info.pending),
        lag: info.lag === null ? null : Number(info.lag),
      };
    }
  }
  return null;
}

// Calls runOnce only while entries are left, because reading an empty
// stream blocks
export async function drainOrders(
  worker: OrderWorker,
  redis: Redis,
  maxRuns = 10,
): Promise<number> {
  for (let runs = 0; runs < maxRuns; runs++) {
    const info = await groupInfo(redis);
    if (info && info.lag === 0 && info.pending === 0) return runs;
    await worker.runOnce();
  }
  throw new Error(`Orders were not drained after ${maxRuns} runs`);
}

export async function selectOrders(
  pool: Pool,
): Promise<{ user_id: string; product_id: string; purchased_at: Date }[]> {
  const result = await pool.query(
    'SELECT user_id, product_id, purchased_at FROM orders ORDER BY id',
  );
  return result.rows;
}
