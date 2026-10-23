// [KO] 통합 테스트 공통 준비: 실제 Redis·PostgreSQL 연결, 매 테스트 전 초기화, 세일 설정, 워커 처리 반복

import { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { config } from '../src/config/config.js';
import { createPool } from '../src/infra/database.js';
import { createRedisClient } from '../src/infra/redis.js';
import { REDIS_KEYS } from '../src/infra/redis-keys.js';
import type { OrderWorker } from '../src/workers/order.worker.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// [KO] enableOfflineQueue가 꺼져 있어 ready 전 명령은 실패하므로 기다린다
async function ready(redis: Redis): Promise<Redis> {
  if (redis.status !== 'ready') {
    await new Promise<void>((resolve, reject) => {
      redis.once('ready', resolve);
      redis.once('error', reject);
    });
  }
  return redis;
}

// [KO] 실제 클라이언트 생성. API용 Redis(구매 스크립트 등록)와 워커용 Redis(src/worker.ts처럼 commandTimeout 없음)
export async function connect(): Promise<{
  redis: Redis;
  workerRedis: Redis;
  pool: Pool;
}> {
  const redis = await ready(createRedisClient());
  const workerRedis = await ready(
    new Redis({
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db,
      enableOfflineQueue: false,
    }),
  );
  return { redis, workerRedis, pool: createPool() };
}

export async function disconnect({
  redis,
  workerRedis,
  pool,
}: {
  redis: Redis;
  workerRedis: Redis;
  pool: Pool;
}): Promise<void> {
  await redis.quit();
  await workerRedis.quit();
  await pool.end();
}

// [KO] 판매 키 삭제(Stream과 함께 컨슈머 그룹도 사라짐) + orders 비우기
export async function resetState(redis: Redis, pool: Pool): Promise<void> {
  await redis.del(
    REDIS_KEYS.SALE_START_AT,
    REDIS_KEYS.SALE_END_AT,
    REDIS_KEYS.SALE_STOCK,
    REDIS_KEYS.SALE_TOTAL_STOCK,
    REDIS_KEYS.SALE_BUYERS,
    REDIS_KEYS.ORDER_STREAM,
  );
  await pool.query('TRUNCATE TABLE orders');
}

export type SaleWindow = 'active' | 'upcoming' | 'ended';

// [KO] 판매 기간과 재고를 Redis에 직접 기록. 경계값과 멀리 떨어진 시각을 써서 시계 차이에 흔들리지 않게 한다
export async function setSale(
  redis: Redis,
  window: SaleWindow,
  stock: number,
): Promise<void> {
  const now = Date.now();
  const [startAt, endAt] = {
    active: [now - MINUTE_MS, now + HOUR_MS],
    upcoming: [now + HOUR_MS, now + 2 * HOUR_MS],
    ended: [now - 2 * HOUR_MS, now - HOUR_MS],
  }[window];
  await redis.mset(
    REDIS_KEYS.SALE_START_AT,
    startAt,
    REDIS_KEYS.SALE_END_AT,
    endAt,
    REDIS_KEYS.SALE_STOCK,
    stock,
    REDIS_KEYS.SALE_TOTAL_STOCK,
    stock,
  );
}

// [KO] 컨슈머 그룹의 pending·lag (그룹이 없으면 null)
export async function groupInfo(
  redis: Redis,
): Promise<{ pending: number; lag: number | null } | null> {
  if (!(await redis.exists(REDIS_KEYS.ORDER_STREAM))) return null;
  // XINFO GROUPS replies with one flat [field, value, ...] array per group
  const groups = (await redis.xinfo(
    'GROUPS',
    REDIS_KEYS.ORDER_STREAM,
  )) as unknown[][];
  for (const fields of groups) {
    const info: Record<string, unknown> = {};
    for (let i = 0; i < fields.length; i += 2) {
      info[String(fields[i])] = fields[i + 1];
    }
    if (info.name === REDIS_KEYS.ORDER_GROUP) {
      return {
        pending: Number(info.pending),
        lag: info.lag === null ? null : Number(info.lag),
      };
    }
  }
  return null;
}

// Calls runOnce only while entries are left, because reading an empty
// stream blocks
// [KO] 그룹이 있고 미전달(lag)·미확인(pending) 메모가 0이 될 때까지 runOnce 반복
export async function drainOrders(
  worker: OrderWorker,
  redis: Redis,
  maxRuns = 10,
): Promise<number> {
  for (let runs = 0; runs < maxRuns; runs++) {
    const info = await groupInfo(redis);
    if (info && info.lag === 0 && info.pending === 0) return runs;
    await worker.runOnce();
  }
  throw new Error(`Orders were not drained after ${maxRuns} runs`);
}

export async function selectOrders(
  pool: Pool,
): Promise<{ user_id: string; product_id: string; purchased_at: Date }[]> {
  const result = await pool.query(
    'SELECT user_id, product_id, purchased_at FROM orders ORDER BY id',
  );
  return result.rows;
}
