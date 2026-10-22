import { Redis } from 'ioredis';
import { config } from '../config/config.js';

export function createRedisClient(): Redis {
  return new Redis({
    host: config.redis.host,
    port: config.redis.port,
  });
}
