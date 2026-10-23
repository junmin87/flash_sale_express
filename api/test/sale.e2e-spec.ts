// GET /api/sale integration tests: sale status (active, upcoming, ended) and
// stock values

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { REDIS_KEYS } from '../src/infra/redis-keys.js';
import { connect, disconnect, resetState, setSale } from './helpers.js';

describe('GET /api/sale', () => {
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

  it.each(['active', 'upcoming', 'ended'] as const)(
    'reports %s with the stock values',
    async (window) => {
      await setSale(clients.redis, window, 10);

      const res = await request(app).get('/api/sale');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        status: window,
        stock: 10,
        totalStock: 10,
      });
    },
  );

  it('returns the times stored in Redis as ISO strings', async () => {
    await setSale(clients.redis, 'active', 10);
    const [startAt, endAt] = await clients.redis.mget(
      REDIS_KEYS.SALE_START_AT,
      REDIS_KEYS.SALE_END_AT,
    );

    const res = await request(app).get('/api/sale');

    expect(res.body.data.startAt).toBe(new Date(Number(startAt)).toISOString());
    expect(res.body.data.endAt).toBe(new Date(Number(endAt)).toISOString());
  });

  it('reports the remaining stock after it changes', async () => {
    await setSale(clients.redis, 'active', 10);
    await clients.redis.set(REDIS_KEYS.SALE_STOCK, 3);

    const res = await request(app).get('/api/sale');

    expect(res.body.data).toMatchObject({ stock: 3, totalStock: 10 });
  });
});
