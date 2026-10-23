// Creates the Redis client from config and registers the purchase Lua script

import { readFileSync } from 'node:fs';
import { Redis, Result } from 'ioredis';
import { config } from '../config/config.js';

// Lua scripts are copied next to the compiled output by the build script
const purchaseLua = readFileSync(
  new URL('../scripts/purchase.lua', import.meta.url),
  'utf8',
);

declare module 'ioredis' {
  interface RedisCommander<Context> {
    purchase(
      startAtKey: string,
      endAtKey: string,
      stockKey: string,
      buyersKey: string,
      orderStreamKey: string,
      userId: string,
      productId: string,
    ): Result<string, Context>;
  }
}

export function createRedisClient(): Redis {
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    db: config.redis.db,
    // Fail commands right away instead of queueing them while disconnected, and
    // fail slow replies after 1 second
    enableOfflineQueue: false,
    commandTimeout: 1000,
  });
  redis.defineCommand('purchase', { numberOfKeys: 5, lua: purchaseLua });
  return redis;
}
