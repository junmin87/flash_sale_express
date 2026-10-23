// Purchase service unit tests (Redis is replaced with a fake): responses and
// errors for each Lua result code, Redis errors -> 503

import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../common/errors/app-error.js';
import { config } from '../config/config.js';
import { REDIS_KEYS } from '../infra/redis-keys.js';
import { createPurchaseService } from './purchase.service.js';

function createService() {
  const redis = {
    purchase: vi.fn(),
    sismember: vi.fn(),
  };
  const service = createPurchaseService({ redis: redis as unknown as Redis });
  return { service, redis };
}

describe('createPurchaseService', () => {
  describe('purchase', () => {
    it('returns userId and productId when the script replies OK', async () => {
      const { service, redis } = createService();
      redis.purchase.mockResolvedValue('OK');

      await expect(service.purchase('junmin')).resolves.toEqual({
        userId: 'junmin',
        productId: config.productId,
      });
      expect(redis.purchase).toHaveBeenCalledWith(
        REDIS_KEYS.SALE_START_AT,
        REDIS_KEYS.SALE_END_AT,
        REDIS_KEYS.SALE_STOCK,
        REDIS_KEYS.SALE_BUYERS,
        REDIS_KEYS.ORDER_STREAM,
        'junmin',
        config.productId,
      );
    });

    it.each([
      ['SALE_NOT_ACTIVE', 403],
      ['ALREADY_PURCHASED', 409],
      ['SOLD_OUT', 409],
    ])('throws %s (%i) for the matching script result', async (code, status) => {
      const { service, redis } = createService();
      redis.purchase.mockResolvedValue(code);

      const error = await service.purchase('junmin').catch((err) => err);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code, status });
    });

    it('throws a non-AppError for an unknown script result', async () => {
      const { service, redis } = createService();
      redis.purchase.mockResolvedValue('SOMETHING_ELSE');

      const error = await service.purchase('junmin').catch((err) => err);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(AppError);
    });

    it('throws SERVICE_UNAVAILABLE when the Redis command fails', async () => {
      const { service, redis } = createService();
      redis.purchase.mockRejectedValue(new Error('Command timed out'));

      await expect(service.purchase('junmin')).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
        status: 503,
      });
    });
  });

  describe('getPurchase', () => {
    it('reports purchased true for a buyer', async () => {
      const { service, redis } = createService();
      redis.sismember.mockResolvedValue(1);

      await expect(service.getPurchase('junmin')).resolves.toEqual({
        userId: 'junmin',
        purchased: true,
      });
      expect(redis.sismember).toHaveBeenCalledWith(
        REDIS_KEYS.SALE_BUYERS,
        'junmin',
      );
    });

    it('reports purchased false for a non-buyer', async () => {
      const { service, redis } = createService();
      redis.sismember.mockResolvedValue(0);

      await expect(service.getPurchase('nobody')).resolves.toEqual({
        userId: 'nobody',
        purchased: false,
      });
    });

    it('throws SERVICE_UNAVAILABLE when the Redis command fails', async () => {
      const { service, redis } = createService();
      redis.sismember.mockRejectedValue(
        new Error("Stream isn't writeable and enableOfflineQueue options is false"),
      );

      await expect(service.getPurchase('junmin')).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
        status: 503,
      });
    });
  });
});
