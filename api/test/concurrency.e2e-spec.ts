// [KO] 동시 구매 통합 테스트: 초과 판매·중복 구매가 없고, 워커 저장 후 재고·구매자·주문 수가 맞는지

import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

describe('concurrent purchases', () => {
  let clients: Awaited<ReturnType<typeof connect>>;
  let server: Server;

  beforeAll(async () => {
    clients = await connect();
    // [KO] 요청마다 임시 서버를 띄우지 않고 하나의 HTTP 서버로 동시에 보낸다
    server = createApp({ redis: clients.redis, pool: clients.pool }).listen(0);
  });

  beforeEach(async () => {
    await resetState(clients.redis, clients.pool);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnect(clients);
  });

  // [KO] 모든 요청을 먼저 만든 뒤 한꺼번에 기다린다
  function purchaseAll(userIds: string[]) {
    return Promise.all(
      userIds.map(async (userId) => {
        const res = await request(server)
          .post('/api/purchases')
          .send({ userId });
        return { userId, status: res.status, code: res.body.error?.code };
      }),
    );
  }

  it('sells exactly the stock to 50 different users and persists each order once', async () => {
    const { redis, workerRedis, pool } = clients;
    const TOTAL_STOCK = 10;
    await setSale(redis, 'active', TOTAL_STOCK);
    const userIds = Array.from({ length: 50 }, (_, i) => `user-${i}`);

    const results = await purchaseAll(userIds);

    const succeeded = results.filter((r) => r.status === 201);
    const failed = results.filter((r) => r.status !== 201);
    expect(succeeded).toHaveLength(TOTAL_STOCK);
    expect(failed).toHaveLength(40);
    for (const r of failed) {
      expect(r).toMatchObject({ status: 409, code: 'SOLD_OUT' });
    }

    // [KO] Redis: 재고 0, 구매자 명단 = 성공한 사용자, Stream 메모 = 성공 수
    const successIds = succeeded.map((r) => r.userId).sort();
    expect(await redis.get(REDIS_KEYS.SALE_STOCK)).toBe('0');
    expect((await redis.smembers(REDIS_KEYS.SALE_BUYERS)).sort()).toEqual(
      successIds,
    );
    expect(await redis.xlen(REDIS_KEYS.ORDER_STREAM)).toBe(TOTAL_STOCK);

    // [KO] 워커로 메모를 모두 저장
    await drainOrders(createOrderWorker({ redis: workerRedis, pool }), redis);

    const orders = await selectOrders(pool);
    const orderUserIds = orders.map((o) => o.user_id).sort();
    expect(orders).toHaveLength(TOTAL_STOCK);
    expect(new Set(orderUserIds).size).toBe(orders.length);
    expect(orderUserIds).toEqual(successIds);
    expect(await groupInfo(redis)).toEqual({ pending: 0, lag: 0 });

    // [KO] 총 재고 = 남은 재고 + 구매자 수 = 주문 수
    const totalStock = Number(await redis.get(REDIS_KEYS.SALE_TOTAL_STOCK));
    const remaining = Number(await redis.get(REDIS_KEYS.SALE_STOCK));
    const buyers = await redis.scard(REDIS_KEYS.SALE_BUYERS);
    expect(totalStock).toBe(TOTAL_STOCK);
    expect(remaining + buyers).toBe(totalStock);
    expect(orders.length).toBe(buyers);
  });

  it('lets the same user buy only once out of 20 concurrent requests', async () => {
    const { redis } = clients;
    await setSale(redis, 'active', 10);

    const results = await purchaseAll(Array(20).fill('same-user'));

    const succeeded = results.filter((r) => r.status === 201);
    const failed = results.filter((r) => r.status !== 201);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(19);
    for (const r of failed) {
      expect(r).toMatchObject({ status: 409, code: 'ALREADY_PURCHASED' });
    }
    expect(await redis.get(REDIS_KEYS.SALE_STOCK)).toBe('9');
    expect(await redis.smembers(REDIS_KEYS.SALE_BUYERS)).toEqual(['same-user']);
    expect(await redis.xlen(REDIS_KEYS.ORDER_STREAM)).toBe(1);
  });
});
