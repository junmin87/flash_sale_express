// [KO] orderWorker 유닛 테스트 (Redis·DB는 가짜 객체로 대체)

import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REDIS_KEYS } from '../infra/redis-keys.js';
import { createOrderWorker } from './order.worker.js';

const PURCHASED_AT = Date.parse('2026-11-01T09:00:00.000Z');

function entry(id: string, userId: string) {
  return [
    id,
    ['userId', userId, 'productId', 'item-1', 'purchasedAt', String(PURCHASED_AT)],
  ];
}

function createWorker() {
  const redis = {
    xgroup: vi.fn().mockResolvedValue('OK'),
    // No pending entries to reclaim unless a test says otherwise
    xautoclaim: vi.fn().mockResolvedValue(['0-0', [], []]),
    xreadgroup: vi.fn().mockResolvedValue(null),
    xack: vi.fn().mockResolvedValue(1),
  };
  const pool = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) };

  const worker = createOrderWorker({
    redis: redis as unknown as Redis,
    pool: pool as unknown as Pool,
  });

  return { worker, redis, pool };
}

describe('createOrderWorker', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('saves a new entry and acknowledges it', async () => {
    const { worker, redis, pool } = createWorker();
    redis.xreadgroup.mockResolvedValue([
      [REDIS_KEYS.ORDER_STREAM, [entry('1-0', 'junmin')]],
    ]);

    await worker.runOnce();

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][1]).toEqual([
      'junmin',
      'item-1',
      new Date(PURCHASED_AT),
    ]);
    expect(redis.xack).toHaveBeenCalledWith(
      REDIS_KEYS.ORDER_STREAM,
      REDIS_KEYS.ORDER_GROUP,
      '1-0',
    );
  });

  it('acknowledges a duplicate entry that inserted no row', async () => {
    const { worker, redis, pool } = createWorker();
    redis.xreadgroup.mockResolvedValue([
      [REDIS_KEYS.ORDER_STREAM, [entry('1-0', 'junmin')]],
    ]);
    pool.query.mockResolvedValue({ rowCount: 0 });

    await worker.runOnce();

    expect(redis.xack).toHaveBeenCalledWith(
      REDIS_KEYS.ORDER_STREAM,
      REDIS_KEYS.ORDER_GROUP,
      '1-0',
    );
  });

  it('does not acknowledge an entry when the database fails', async () => {
    vi.useFakeTimers();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { worker, redis, pool } = createWorker();
    redis.xreadgroup.mockResolvedValue([
      [REDIS_KEYS.ORDER_STREAM, [entry('1-0', 'junmin'), entry('2-0', 'user1')]],
    ]);
    pool.query.mockRejectedValue(new Error('connection refused'));

    const run = worker.runOnce();
    await vi.runAllTimersAsync();
    await run;

    // Stops at the first failure, the rest stays pending
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(redis.xack).not.toHaveBeenCalled();
  });

  it('creates the consumer group again on NOGROUP and keeps going', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { worker, redis, pool } = createWorker();
    redis.xreadgroup
      .mockRejectedValueOnce(new Error('NOGROUP No such key or consumer group'))
      .mockResolvedValueOnce([
        [REDIS_KEYS.ORDER_STREAM, [entry('1-0', 'user3')]],
      ]);

    await worker.runOnce();

    expect(redis.xgroup).toHaveBeenCalledWith(
      'CREATE',
      REDIS_KEYS.ORDER_STREAM,
      REDIS_KEYS.ORDER_GROUP,
      '0',
      'MKSTREAM',
    );

    await worker.runOnce();

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(redis.xack).toHaveBeenCalledWith(
      REDIS_KEYS.ORDER_STREAM,
      REDIS_KEYS.ORDER_GROUP,
      '1-0',
    );
  });

  it('processes reclaimed pending entries the same way', async () => {
    const { worker, redis, pool } = createWorker();
    redis.xautoclaim.mockResolvedValueOnce([
      '0-0',
      [entry('1-0', 'user2')],
      [],
    ]);

    await worker.runOnce();

    const args = redis.xautoclaim.mock.calls[0];
    expect(args.slice(0, 2)).toEqual([
      REDIS_KEYS.ORDER_STREAM,
      REDIS_KEYS.ORDER_GROUP,
    ]);
    // Only entries idle for over 30 seconds are reclaimed
    expect(args[3]).toBe(30_000);
    expect(pool.query.mock.calls[0][1][0]).toBe('user2');
    expect(redis.xack).toHaveBeenCalledWith(
      REDIS_KEYS.ORDER_STREAM,
      REDIS_KEYS.ORDER_GROUP,
      '1-0',
    );
  });

  it('reclaims at most once every 10 seconds', async () => {
    const { worker, redis } = createWorker();
    const now = Date.now();

    await worker.runOnce(now);
    await worker.runOnce(now + 9_999);
    expect(redis.xautoclaim).toHaveBeenCalledTimes(1);

    await worker.runOnce(now + 10_000);
    expect(redis.xautoclaim).toHaveBeenCalledTimes(2);
  });
});
