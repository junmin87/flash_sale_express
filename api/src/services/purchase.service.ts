// [KO] 구매 처리·구매 여부 조회 서비스. 판정은 Lua 스크립트 하나에서 하고, Redis를 인자로 받는 팩토리 함수

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
// [KO] Redis 명령 실패는 모두 503 SERVICE_UNAVAILABLE로 변환
async function callRedis<T>(command: () => Promise<T>): Promise<T> {
  try {
    return await command();
  } catch {
    throw new AppError('SERVICE_UNAVAILABLE');
  }
}

export type PurchaseService = ReturnType<typeof createPurchaseService>;

export function createPurchaseService({ redis }: { redis: Redis }) {
  // [KO] 시간·중복·재고 확인과 차감·구매자 기록·주문 Stream 추가를 Lua 한 번으로 처리
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
    // [KO] 스크립트가 정의되지 않은 값을 반환하면 버그이므로 500
    throw new Error(`Unexpected purchase script result: ${result}`);
  }

  // [KO] Redis 구매자 명단 기준으로 구매 여부 조회
  async function getPurchase(userId: string): Promise<PurchaseStatus> {
    const isMember = await callRedis(() =>
      redis.sismember(REDIS_KEYS.SALE_BUYERS, userId),
    );
    return { userId, purchased: isMember === 1 };
  }

  return { purchase, getPurchase };
}
