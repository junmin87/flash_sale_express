// [KO] 주문 Stream을 컨슈머 그룹으로 읽어 orders 테이블에 저장하는 워커. 저장된 메모만 XACK, 오래 처리 안 된 메모는 XAUTOCLAIM으로 재처리

import type { Redis } from 'ioredis';
import { hostname } from 'node:os';
import type { Pool } from 'pg';
import { log } from '../common/logger.js';
import { REDIS_KEYS } from '../infra/redis-keys.js';
import { createOrderService } from '../services/order.service.js';

// Maximum entries read or claimed at once
const BATCH_SIZE = 100;
// How long XREADGROUP waits for new entries
const READ_BLOCK_MS = 5_000;
// How often pending entries are reclaimed
const CLAIM_INTERVAL_MS = 10_000;
// Pending entries idle longer than this are reclaimed
const CLAIM_MIN_IDLE_MS = 30_000;
// Pause after a Redis or database failure before trying again
const RETRY_DELAY_MS = 1_000;

// Stream entry as replied by Redis: [id, [field, value, ...]]
type StreamEntry = [id: string, fields: string[]];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// [KO] 그룹이 없을 때(관리자 리셋으로 Stream이 DEL된 경우) Redis가 돌려주는 에러인지
function isNoGroupError(error: unknown): boolean {
  return errorMessage(error).startsWith('NOGROUP');
}

// [KO] [field, value, ...] 배열을 주문 입력으로 변환
function toOrder(fields: string[]) {
  const values: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    values[fields[i]] = fields[i + 1];
  }
  return {
    userId: values.userId,
    productId: values.productId,
    purchasedAt: Number(values.purchasedAt),
  };
}

export type OrderWorker = ReturnType<typeof createOrderWorker>;

export function createOrderWorker({
  redis,
  pool,
}: {
  redis: Redis;
  pool: Pool;
}) {
  const orderService = createOrderService({ pool });
  // Container hostname, unique per worker instance
  const consumer = hostname();
  let running = false;
  let loop: Promise<void> | undefined;
  let lastClaimAt = 0;

  // [KO] 컨슈머 그룹 생성. 0부터 읽어 그룹 생성 전에 쌓인 메모도 처리한다. 이미 있으면(BUSYGROUP) 무시
  async function ensureGroup(): Promise<void> {
    try {
      await redis.xgroup(
        'CREATE',
        REDIS_KEYS.ORDER_STREAM,
        REDIS_KEYS.ORDER_GROUP,
        '0',
        'MKSTREAM',
      );
      log('info', `Created consumer group ${REDIS_KEYS.ORDER_GROUP}`);
    } catch (error) {
      if (!errorMessage(error).startsWith('BUSYGROUP')) throw error;
    }
  }

  // Stops at the first database failure so the rest stays pending and is
  // reclaimed later
  // [KO] 메모마다 INSERT 후 XACK. DB 실패 시 XACK 없이 에러 로그, 1초 쉰 뒤 false 반환
  async function processEntries(entries: StreamEntry[]): Promise<boolean> {
    for (const [id, fields] of entries) {
      try {
        await orderService.createOrder(toOrder(fields));
      } catch (error) {
        log('error', `Failed to save order ${id}: ${errorMessage(error)}`);
        await sleep(RETRY_DELAY_MS);
        return false;
      }
      await redis.xack(REDIS_KEYS.ORDER_STREAM, REDIS_KEYS.ORDER_GROUP, id);
    }
    return true;
  }

  // [KO] 이 워커에 아직 전달되지 않은 새 메모를 최대 100건 읽는다. 없으면 5초까지 대기
  async function readNew(): Promise<void> {
    const reply = (await redis.xreadgroup(
      'GROUP',
      REDIS_KEYS.ORDER_GROUP,
      consumer,
      'COUNT',
      BATCH_SIZE,
      'BLOCK',
      READ_BLOCK_MS,
      'STREAMS',
      REDIS_KEYS.ORDER_STREAM,
      '>',
    )) as [key: string, entries: StreamEntry[]][] | null;
    if (!reply) return;
    await processEntries(reply[0][1]);
  }

  // [KO] 30초 넘게 XACK 되지 않은 메모를 이 워커로 가져와 같은 방식으로 처리. 끝까지 훑거나 DB 실패 시 멈춘다
  async function claimPending(): Promise<void> {
    let cursor = '0-0';
    do {
      // XAUTOCLAIM replies with [next cursor, entries, deleted ids]
      const [next, entries] = (await redis.xautoclaim(
        REDIS_KEYS.ORDER_STREAM,
        REDIS_KEYS.ORDER_GROUP,
        consumer,
        CLAIM_MIN_IDLE_MS,
        cursor,
        'COUNT',
        BATCH_SIZE,
      )) as [string, StreamEntry[], string[]];
      if (!(await processEntries(entries))) return;
      cursor = next;
    } while (cursor !== '0-0' && running);
  }

  // [KO] 한 번의 반복: 10초가 지났으면 재처리 후 새 메모 읽기. Redis 에러는 여기서 처리해 루프가 멈추지 않게 한다
  async function runOnce(now: number = Date.now()): Promise<void> {
    try {
      if (now - lastClaimAt >= CLAIM_INTERVAL_MS) {
        lastClaimAt = now;
        await claimPending();
      }
      await readNew();
    } catch (error) {
      if (isNoGroupError(error)) {
        // [KO] 관리자 리셋으로 Stream이 삭제되면 그룹도 사라지므로 다시 만든다
        log('info', 'Consumer group is missing, creating it again');
        await recreateGroup();
      } else {
        await logAndWait(error);
      }
    }
  }

  // [KO] 그룹 재생성. 실패하면 로그 남기고 1초 대기 후 다음 반복에서 다시 시도
  async function recreateGroup(): Promise<void> {
    try {
      await ensureGroup();
    } catch (error) {
      await logAndWait(error);
    }
  }

  // [KO] Redis 에러 로그를 남기고 1초 대기
  async function logAndWait(error: unknown): Promise<void> {
    log('error', `Order worker Redis error: ${errorMessage(error)}`);
    await sleep(RETRY_DELAY_MS);
  }

  // [KO] 그룹을 준비한 뒤 stop() 전까지 반복. 그룹 생성 실패도 1초 후 재시도
  async function run(): Promise<void> {
    while (running) {
      try {
        await ensureGroup();
        break;
      } catch (error) {
        await logAndWait(error);
      }
    }
    while (running) {
      await runOnce();
    }
  }

  function start(): void {
    if (running) return;
    running = true;
    log('info', `Order worker started as consumer ${consumer}`);
    loop = run();
  }

  // [KO] 새 반복을 멈추고 현재 처리 중인 묶음이 끝날 때까지 기다린다
  async function stop(): Promise<void> {
    running = false;
    await loop;
  }

  return { start, stop, runOnce };
}
