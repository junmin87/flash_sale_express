// Worker that reads the order stream as a consumer group and saves entries to
// the orders table. Only saved entries are XACKed, and entries left unacked too
// long are reprocessed with XAUTOCLAIM

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

// Whether Redis replied that the group is missing (the stream was deleted by an
// admin reset)
function isNoGroupError(error: unknown): boolean {
  return errorMessage(error).startsWith('NOGROUP');
}

// Converts a [field, value, ...] array to an order input
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

  // Creates the consumer group. Reads from 0 so entries added before the group
  // exists are also processed. Ignores BUSYGROUP (already exists)
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

  // Reads up to 100 new entries not yet delivered to this worker, waiting up to
  // 5 seconds if there are none
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

  // Claims entries not XACKed for over 30 seconds and processes them the same
  // way. Stops at the end of the scan or on a DB failure
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

  // One iteration: reprocess if 10 seconds have passed, then read new entries.
  // Redis errors are handled here so the loop does not stop
  async function runOnce(now: number = Date.now()): Promise<void> {
    try {
      if (now - lastClaimAt >= CLAIM_INTERVAL_MS) {
        lastClaimAt = now;
        await claimPending();
      }
      await readNew();
    } catch (error) {
      if (isNoGroupError(error)) {
        // An admin reset deletes the stream, which also removes the group, so
        // create it again
        log('info', 'Consumer group is missing, creating it again');
        await recreateGroup();
      } else {
        await logAndWait(error);
      }
    }
  }

  // On failure, log and wait 1 second. The next iteration tries again
  async function recreateGroup(): Promise<void> {
    try {
      await ensureGroup();
    } catch (error) {
      await logAndWait(error);
    }
  }

  async function logAndWait(error: unknown): Promise<void> {
    log('error', `Order worker Redis error: ${errorMessage(error)}`);
    await sleep(RETRY_DELAY_MS);
  }

  // Prepares the group, then repeats until stop(). Group creation failures are
  // also retried after 1 second
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

  // Stops new iterations and waits for the current batch to finish
  async function stop(): Promise<void> {
    running = false;
    await loop;
  }

  return { start, stop, runOnce };
}
