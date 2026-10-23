// Health check controller: returns the Redis and PostgreSQL status and the
// hostname

import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import { hostname } from 'node:os';
import type { Pool } from 'pg';
import { ok } from '../common/response.js';

type CheckResult = { ok: true; result: unknown } | { ok: false; error: string };

async function run(fn: () => Promise<unknown>): Promise<CheckResult> {
  try {
    return { ok: true, result: await fn() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message || err.name : String(err),
    };
  }
}

export function createHealthController({
  redis,
  pool,
}: {
  redis: Redis;
  pool: Pool;
}) {
  return {
    async check(_req: Request, res: Response): Promise<void> {
      const [redisResult, postgres] = await Promise.all([
        run(() => redis.ping()),
        run(async () => (await pool.query('SELECT 1 AS ok')).rows[0].ok),
      ]);
      ok(res, { hostname: hostname(), redis: redisResult, postgres });
    },
  };
}
