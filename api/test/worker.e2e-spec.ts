// [KO] 주문 워커 통합 테스트: runOnce를 직접 호출해 Stream 메모가 orders에 저장되는지 확인

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
  groupInfo,
  resetState,
  selectOrders,
  setSale,
} from './helpers.js';

type StreamEntry = [id: string, fields: string[]];

describe('order worker', () => {
  let clients: Awaited<ReturnType<typeof connect>>;
  let app: Express;

  beforeAll(async () => {
    clients = await connect();
    app = createApp({ redis: clients.redis, pool: clients.pool });
  });

  beforeEach(async () => {
    await resetState(clients.redis, clients.pool);
    await setSale(clients.redis, 'active', 10);
  });

  afterAll(async () => {
    await disconnect(clients);
  });

  function purchase(userId: string) {
    return request(app).post('/api/purchases').send({ userId }).expect(201);
  }

  function createWorker() {
    return createOrderWorker({
      redis: clients.workerRedis,
      pool: clients.pool,
    });
  }

  // XPENDING summary replies with [count, smallest id, greatest id, consumers]
  async function pendingCount(): Promise<number> {
    const [count] = (await clients.redis.xpending(
      REDIS_KEYS.ORDER_STREAM,
      REDIS_KEYS.ORDER_GROUP,
    )) as [number, ...unknown[]];
    return count;
  }

  async function streamEntries(): Promise<StreamEntry[]> {
    return clients.redis.xrange(REDIS_KEYS.ORDER_STREAM, '-', '+');
  }

  it('saves a purchase with its purchased_at and leaves nothing pending', async () => {
    await purchase('user-1');
    const [[, fields]] = await streamEntries();
    const purchasedAt = Number(fields[fields.indexOf('purchasedAt') + 1]);

    await drainOrders(createWorker(), clients.redis);

    const orders = await selectOrders(clients.pool);
    expect(orders).toHaveLength(1);
    expect(orders[0].user_id).toBe('user-1');
    expect(orders[0].purchased_at.getTime()).toBe(purchasedAt);
    expect(await pendingCount()).toBe(0);
  });

  it('keeps one order when the same entry is added to the stream twice', async () => {
    const worker = createWorker();
    await purchase('user-1');
    await drainOrders(worker, clients.redis);
    // [KO] 같은 내용의 메모를 한 번 더 넣는다 (중복 전달 상황)
    const [[, fields]] = await streamEntries();
    await clients.redis.xadd(REDIS_KEYS.ORDER_STREAM, '*', ...fields);

    await drainOrders(worker, clients.redis);

    expect(await selectOrders(clients.pool)).toHaveLength(1);
    expect(await pendingCount()).toBe(0);
  });

  it('keeps one order when the entry was already saved before the worker crashed', async () => {
    const { redis, pool } = clients;
    await purchase('user-1');
    // [KO] 워커가 DB에 저장한 뒤 XACK 전에 죽은 상황: 같은 주문을 orders에 미리 넣는다
    const [[, fields]] = await streamEntries();
    const value = (name: string) => fields[fields.indexOf(name) + 1];
    await pool.query(
      'INSERT INTO orders (user_id, product_id, purchased_at) VALUES ($1, $2, $3)',
      [value('userId'), value('productId'), new Date(Number(value('purchasedAt')))],
    );

    await drainOrders(createWorker(), redis);

    expect(await selectOrders(pool)).toHaveLength(1);
    expect(await pendingCount()).toBe(0);
  });

  it('recreates the consumer group after an admin reset and saves new orders', async () => {
    const { redis, pool } = clients;
    const worker = createWorker();
    await purchase('user-1');
    await drainOrders(worker, redis);
    expect(await selectOrders(pool)).toHaveLength(1);

    const now = Date.now();
    await request(app)
      .post('/api/admin/sale')
      .send({
        startAt: new Date(now - 60 * 1000).toISOString(),
        endAt: new Date(now + 60 * 60 * 1000).toISOString(),
        stock: 5,
      })
      .expect(201);
    expect(await groupInfo(redis)).toBeNull();
    await purchase('user-2');

    await drainOrders(worker, redis);

    expect(await groupInfo(redis)).toEqual({ pending: 0, lag: 0 });
    const orders = await selectOrders(pool);
    expect(orders.map((o) => o.user_id)).toEqual(['user-2']);
  });
});
