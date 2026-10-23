// Purchase and purchase lookup service. The decision runs in one Lua script. A
// factory function that takes Redis

import type { Redis } from 'ioredis';
import { AppError } from '../common/errors/app-error.js';
import { config } from '../config/config.js';
import { REDIS_KEYS } from '../infra/redis-keys.js';

export interface PurchaseResult {
  userId: string;
  productId: string;
}

export interface PurchaseStatus {
  userId: string;
  purchased: boolean;
}

// Failure codes the purchase script can return, besides 'OK'
const PURCHASE_FAILURES = [
  'SALE_NOT_ACTIVE',
  'ALREADY_PURCHASED',
  'SOLD_OUT',
] as const;

type PurchaseFailure = (typeof PURCHASE_FAILURES)[number];

function isPurchaseFailure(result: string): result is PurchaseFailure {
  return (PURCHASE_FAILURES as readonly string[]).includes(result);
}

// Any Redis failure (disconnected, timed out, script error) rejects the
// request instead of falling back to the database. Not logged per request,
// so an outage does not flood the logs
async function callRedis<T>(command: () => Promise<T>): Promise<T> {
  try {
    return await command();
  } catch {
    throw new AppError('SERVICE_UNAVAILABLE');
  }
}

export type PurchaseService = ReturnType<typeof createPurchaseService>;

export function createPurchaseService({ redis }: { redis: Redis }) {
  // Time, duplicate and stock checks plus the stock decrement, buyer record and
  // order stream entry run in one Lua call
  async function purchase(userId: string): Promise<PurchaseResult> {
    const { productId } = config;
    const result = await callRedis(() =>
      redis.purchase(
        REDIS_KEYS.SALE_START_AT,
        REDIS_KEYS.SALE_END_AT,
        REDIS_KEYS.SALE_STOCK,
        REDIS_KEYS.SALE_BUYERS,
        REDIS_KEYS.ORDER_STREAM,
        userId,
        productId,
      ),
    );
    if (result === 'OK') return { userId, productId };
    if (isPurchaseFailure(result)) throw new AppError(result);
    // An unexpected script result is a bug, so it becomes a 500
    throw new Error(`Unexpected purchase script result: ${result}`);
  }

  // Checks the purchase status from the Redis buyer set
  async function getPurchase(userId: string): Promise<PurchaseStatus> {
    const isMember = await callRedis(() =>
      redis.sismember(REDIS_KEYS.SALE_BUYERS, userId),
    );
    return { userId, purchased: isMember === 1 };
  }

  return { purchase, getPurchase };
}
