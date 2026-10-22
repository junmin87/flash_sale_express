// [KO] saleService 유닛 테스트 (Redis·DB는 가짜 객체로 대체)

import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../common/errors/app-error.js';
import { REDIS_KEYS } from '../infra/redis-keys.js';
import { createSaleService } from './sale.service.js';

const START = Date.parse('2026-11-01T09:00:00.000Z');
const END = Date.parse('2026-11-01T10:00:00.000Z');

// Redis TIME reply for the given epoch milliseconds
function timeReply(ms: number): string[] {
  return [String(Math.floor(ms / 1000)), String((ms % 1000) * 1000)];
}

function createService() {
  const multi = {
    mset: vi.fn(),
    del: vi.fn(),
    exec: vi.fn().mockResolvedValue([
      [null, 'OK'],
      [null, 2],
    ]),
  };
  multi.mset.mockReturnValue(multi);
  multi.del.mockReturnValue(multi);

  const redis = {
    msetnx: vi.fn(),
    mget: vi.fn(),
    time: vi.fn(),
    multi: vi.fn().mockReturnValue(multi),
  };
  const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };

  const service = createSaleService({
    redis: redis as unknown as Redis,
    pool: pool as unknown as Pool,
  });

  return { service, redis, multi, pool };
}

describe('createSaleService', () => {
  describe('getSale', () => {
    it('returns the sale state judged by Redis time', async () => {
      const { service, redis } = createService();
      redis.mget.mockResolvedValue([String(START), String(END), '7', '10']);
      redis.time.mockResolvedValue(timeReply(START + 1));

      await expect(service.getSale()).resolves.toEqual({
        status: 'active',
        startAt: '2026-11-01T09:00:00.000Z',
        endAt: '2026-11-01T10:00:00.000Z',
        stock: 7,
        totalStock: 10,
      });
    });

    it('reports upcoming and ended from Redis time', async () => {
      const { service, redis } = createService();
      redis.mget.mockResolvedValue([String(START), String(END), '10', '10']);

      redis.time.mockResolvedValue(timeReply(START - 1));
      expect((await service.getSale()).status).toBe('upcoming');

      redis.time.mockResolvedValue(timeReply(END));
      expect((await service.getSale()).status).toBe('ended');
    });

    it('throws SERVICE_UNAVAILABLE when sale settings are missing', async () => {
      const { service, redis } = createService();
      redis.mget.mockResolvedValue([null, null, null, null]);
      redis.time.mockResolvedValue(timeReply(START));

      await expect(service.getSale()).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
      });
      await expect(service.getSale()).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('initSale', () => {
    it('writes settings only when absent with a single MSETNX', async () => {
      const { service, redis } = createService();
      redis.msetnx.mockResolvedValue(0);
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      await service.initSale();

      expect(redis.msetnx).toHaveBeenCalledTimes(1);
      const args = redis.msetnx.mock.calls[0];
      expect(args.filter((_: unknown, i: number) => i % 2 === 0)).toEqual([
        REDIS_KEYS.SALE_START_AT,
        REDIS_KEYS.SALE_END_AT,
        REDIS_KEYS.SALE_STOCK,
        REDIS_KEYS.SALE_TOTAL_STOCK,
      ]);
      vi.restoreAllMocks();
    });
  });

  describe('setSale', () => {
    it('resets Redis in one transaction, empties orders and returns the new state', async () => {
      const { service, redis, multi, pool } = createService();
      redis.mget.mockResolvedValue([String(START), String(END), '5', '5']);
      redis.time.mockResolvedValue(timeReply(START - 60_000));

      const result = await service.setSale({
        startAt: '2026-11-01T09:00:00.000Z',
        endAt: '2026-11-01T10:00:00.000Z',
        stock: 5,
      });

      expect(multi.mset).toHaveBeenCalledWith(
        REDIS_KEYS.SALE_START_AT,
        START,
        REDIS_KEYS.SALE_END_AT,
        END,
        REDIS_KEYS.SALE_STOCK,
        5,
        REDIS_KEYS.SALE_TOTAL_STOCK,
        5,
      );
      expect(multi.del).toHaveBeenCalledWith(
        REDIS_KEYS.SALE_BUYERS,
        REDIS_KEYS.ORDER_STREAM,
      );
      expect(multi.exec).toHaveBeenCalledTimes(1);
      expect(pool.query).toHaveBeenCalledWith('TRUNCATE TABLE orders');
      expect(result).toEqual({
        status: 'upcoming',
        startAt: '2026-11-01T09:00:00.000Z',
        endAt: '2026-11-01T10:00:00.000Z',
        stock: 5,
        totalStock: 5,
      });
    });

    it('does not touch the database when the Redis transaction fails', async () => {
      const { service, multi, pool } = createService();
      multi.exec.mockResolvedValue(null);

      await expect(
        service.setSale({
          startAt: '2026-11-01T09:00:00.000Z',
          endAt: '2026-11-01T10:00:00.000Z',
          stock: 5,
        }),
      ).rejects.toThrow();
      expect(pool.query).not.toHaveBeenCalled();
    });
  });
});
