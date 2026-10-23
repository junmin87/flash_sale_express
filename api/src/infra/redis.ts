// [KO] config 기반 Redis 클라이언트 생성 + 구매 Lua 스크립트 등록

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
    // [KO] 연결이 끊기면 명령을 대기열에 쌓지 않고 바로 실패, 응답이 늦으면 1초 후 실패
    enableOfflineQueue: false,
    commandTimeout: 1000,
  });
  redis.defineCommand('purchase', { numberOfKeys: 5, lua: purchaseLua });
  return redis;
}
