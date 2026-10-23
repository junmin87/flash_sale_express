// POST /api/admin/sale integration tests: buyers, stream and orders are cleared
// after the settings change

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { REDIS_KEYS } from '../src/infra/redis-keys.js';
import { createOrderWorker } from '../src/workers/order.worker.js';
import {
  connect,
  disconnect,
  drainOrders,
  resetState,
  selectOrders,
  setSale,
} from './helpers.js';

describe('POST /api/admin/sale', () => {
  let clients: Awaited<ReturnType<typeof connect>>;
  let app: Express;

  beforeAll(async () => {
    clients = await connect();
    app = createApp({ redis: clients.redis, pool: clients.pool });
  });

  beforeEach(async () => {
    await resetState(clients.redis, clients.pool);
  });

  afterAll(async () => {
    await disconnect(clients);
  });

  it('applies the new settings and empties buyers, the stream and orders', async () => {
    const { redis, workerRedis, pool } = clients;
    await setSale(redis, 'active', 10);
    for (const userId of ['user-1', 'user-2', 'user-3']) {
      await request(app).post('/api/purchases').send({ userId });
    }
    await drainOrders(createOrderWorker({ redis: workerRedis, pool }), redis);
    // Leave an entry in the stream that is not saved yet
    await request(app).post('/api/purchases').send({ userId: 'user-4' });
    expect(await redis.scard(REDIS_KEYS.SALE_BUYERS)).toBe(4);
    expect(await redis.xlen(REDIS_KEYS.ORDER_STREAM)).toBe(4);
    expect(await selectOrders(pool)).toHaveLength(3);

    const startAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const endAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .post('/api/admin/sale')
      .send({ startAt, endAt, stock: 5 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: { status: 'upcoming', startAt, endAt, stock: 5, totalStock: 5 },
    });
    expect(await redis.exists(REDIS_KEYS.SALE_BUYERS)).toBe(0);
    expect(await redis.exists(REDIS_KEYS.ORDER_STREAM)).toBe(0);
    expect(await selectOrders(pool)).toHaveLength(0);

    const sale = await request(app).get('/api/sale');
    expect(sale.body.data).toEqual(res.body.data);
  });
});
