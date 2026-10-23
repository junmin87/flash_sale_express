// POST /api/purchases and GET /api/purchases/:userId integration tests (real
// Redis Lua script)

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { config } from '../src/config/config.js';
import { REDIS_KEYS } from '../src/infra/redis-keys.js';
import { connect, disconnect, resetState, setSale } from './helpers.js';

describe('purchases', () => {
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

  // Reads stock, buyer count and stream length at once
  async function saleCounts() {
    const { redis } = clients;
    return {
      stock: Number(await redis.get(REDIS_KEYS.SALE_STOCK)),
      buyers: await redis.scard(REDIS_KEYS.SALE_BUYERS),
      streamLength: await redis.xlen(REDIS_KEYS.ORDER_STREAM),
    };
  }

  describe('POST /api/purchases', () => {
    it('returns 201 and records the purchase in Redis', async () => {
      await setSale(clients.redis, 'active', 10);

      const res = await request(app)
        .post('/api/purchases')
        .send({ userId: 'user-1' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        success: true,
        data: { userId: 'user-1', productId: config.productId },
      });
      expect(await saleCounts()).toEqual({
        stock: 9,
        buyers: 1,
        streamLength: 1,
      });
      expect(
        await clients.redis.sismember(REDIS_KEYS.SALE_BUYERS, 'user-1'),
      ).toBe(1);

      const [[, fields]] = await clients.redis.xrange(
        REDIS_KEYS.ORDER_STREAM,
        '-',
        '+',
      );
      expect(fields.slice(0, 4)).toEqual([
        'userId',
        'user-1',
        'productId',
        config.productId,
      ]);
      expect(fields[4]).toBe('purchasedAt');
      expect(Number(fields[5])).toBeGreaterThan(0);
    });

    it('returns 409 ALREADY_PURCHASED for the same userId', async () => {
      await setSale(clients.redis, 'active', 10);
      await request(app).post('/api/purchases').send({ userId: 'user-1' });

      const res = await request(app)
        .post('/api/purchases')
        .send({ userId: 'user-1' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ALREADY_PURCHASED');
      expect(await saleCounts()).toEqual({
        stock: 9,
        buyers: 1,
        streamLength: 1,
      });
    });

    it('returns 409 SOLD_OUT when no stock is left', async () => {
      await setSale(clients.redis, 'active', 0);

      const res = await request(app)
        .post('/api/purchases')
        .send({ userId: 'user-1' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SOLD_OUT');
      expect(await saleCounts()).toEqual({
        stock: 0,
        buyers: 0,
        streamLength: 0,
      });
    });

    it.each(['upcoming', 'ended'] as const)(
      'returns 403 SALE_NOT_ACTIVE when the sale is %s',
      async (window) => {
        await setSale(clients.redis, window, 10);

        const res = await request(app)
          .post('/api/purchases')
          .send({ userId: 'user-1' });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('SALE_NOT_ACTIVE');
        expect(await saleCounts()).toEqual({
          stock: 10,
          buyers: 0,
          streamLength: 0,
        });
      },
    );

    it.each([
      ['empty', ''],
      ['65 characters', 'a'.repeat(65)],
    ])(
      'returns 400 VALIDATION_ERROR for a %s userId',
      async (_label, userId) => {
        await setSale(clients.redis, 'active', 10);

        const res = await request(app).post('/api/purchases').send({ userId });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(await saleCounts()).toEqual({
          stock: 10,
          buyers: 0,
          streamLength: 0,
        });
      },
    );
  });

  describe('GET /api/purchases/:userId', () => {
    it('returns true for a buyer and false for anyone else', async () => {
      await setSale(clients.redis, 'active', 10);
      await request(app).post('/api/purchases').send({ userId: 'user-1' });

      const bought = await request(app).get('/api/purchases/user-1');
      const notBought = await request(app).get('/api/purchases/user-2');

      expect(bought.status).toBe(200);
      expect(bought.body).toEqual({
        success: true,
        data: { userId: 'user-1', purchased: true },
      });
      expect(notBought.status).toBe(200);
      expect(notBought.body).toEqual({
        success: true,
        data: { userId: 'user-2', purchased: false },
      });
    });
  });
});
