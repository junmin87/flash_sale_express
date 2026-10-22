// [KO] 세일 설정(시간·재고)을 Redis에 초기화·조회·재설정하는 서비스. Redis·DB를 인자로 받는 팩토리 함수

import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { AppError } from '../common/errors/app-error.js';
import { log } from '../common/logger.js';
import { config } from '../config/config.js';
import { REDIS_KEYS } from '../infra/redis-keys.js';
import { SaleStatus, getSaleStatus } from '../sale/sale-status.js';
import type { SetSaleInput } from '../validators/sale.validator.js';

export interface SaleState {
  status: SaleStatus;
  startAt: string;
  endAt: string;
  stock: number;
  totalStock: number;
}

export type SaleService = ReturnType<typeof createSaleService>;

export function createSaleService({
  redis,
  pool,
}: {
  redis: Redis;
  pool: Pool;
}) {
  // MSETNX writes all keys or none, so concurrent or repeated boots never
  // overwrite a sale that is already configured
  // [KO] 서버 부팅 시 env 값으로 세일 설정을 쓴다. 이미 있으면 덮어쓰지 않는다
  async function initSale(): Promise<void> {
    const { startAt, endAt, stock } = config.sale;
    const written = await redis.msetnx(
      REDIS_KEYS.SALE_START_AT,
      startAt,
      REDIS_KEYS.SALE_END_AT,
      endAt,
      REDIS_KEYS.SALE_STOCK,
      stock,
      REDIS_KEYS.SALE_TOTAL_STOCK,
      stock,
    );
    // [KO] 1이면 새로 기록, 0이면 기존 설정 유지
    if (written === 1) {
      log('info', 'Initialized sale settings in Redis');
    } else {
      log('info', 'Sale settings already exist in Redis, left unchanged');
    }
  }

  // [KO] 세일 설정과 Redis 서버 시간을 함께 읽어 현재 상태를 계산한다
  async function getSale(): Promise<SaleState> {
    const [values, time] = await Promise.all([
      redis.mget(
        REDIS_KEYS.SALE_START_AT,
        REDIS_KEYS.SALE_END_AT,
        REDIS_KEYS.SALE_STOCK,
        REDIS_KEYS.SALE_TOTAL_STOCK,
      ),
      redis.time(),
    ]);
    // [KO] 키가 하나라도 없으면 설정이 없는 것으로 보고 503
    if (values.some((value) => value === null)) {
      throw new AppError('SERVICE_UNAVAILABLE');
    }
    const [startAt, endAt, stock, totalStock] = values.map(Number);
    // TIME replies with [seconds, microseconds]
    // [KO] 판정 기준 시간은 앱 서버가 아니라 Redis 서버 시간 (ms로 변환)
    const now = Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);

    return {
      status: getSaleStatus(now, startAt, endAt),
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      stock,
      totalStock,
    };
  }

  // Redis is reset before the database so that no queued order can be
  // persisted after the orders table is emptied
  // [KO] 관리자 재설정: Redis 설정 덮어쓰기 + 구매자·주문 스트림 삭제 후 orders 테이블 비움
  async function setSale(input: SetSaleInput): Promise<SaleState> {
    const results = await redis
      .multi()
      .mset(
        REDIS_KEYS.SALE_START_AT,
        Date.parse(input.startAt),
        REDIS_KEYS.SALE_END_AT,
        Date.parse(input.endAt),
        REDIS_KEYS.SALE_STOCK,
        input.stock,
        REDIS_KEYS.SALE_TOTAL_STOCK,
        input.stock,
      )
      // [KO] 이전 세일의 구매자 목록과 미처리 주문 스트림 삭제 (MULTI로 한 번에 실행)
      .del(REDIS_KEYS.SALE_BUYERS, REDIS_KEYS.ORDER_STREAM)
      .exec();
    // [KO] exec 결과가 null(트랜잭션 중단)이거나 명령 하나라도 실패하면 DB를 건드리지 않고 에러
    const failed = results?.find(([error]) => error !== null);
    if (!results || failed) {
      throw failed?.[0] ?? new Error('Redis transaction was aborted');
    }

    // [KO] Redis 리셋 성공 후에만 DB 주문 테이블을 비운다
    await pool.query('TRUNCATE TABLE orders');

    return getSale();
  }

  return { initSale, getSale, setSale };
}
