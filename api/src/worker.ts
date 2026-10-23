// [KO] 주문 저장 워커 진입점: Redis·DB 연결 생성, 워커 시작, 종료 시그널 처리. HTTP 서버 없음

import { Redis } from 'ioredis';
import { log } from './common/logger.js';
import { config } from './config/config.js';
import { createPool } from './infra/database.js';
import { createOrderWorker } from './workers/order.worker.js';

// A separate client without commandTimeout, because XREADGROUP blocks for
// longer than the API client's 1 second timeout
// [KO] 연결이 끊기면 명령을 쌓지 않고 바로 실패시켜 워커 루프가 로그 후 재시도하게 한다
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  db: config.redis.db,
  enableOfflineQueue: false,
});
const pool = createPool();

// Without listeners these errors are printed by ioredis or crash the
// process (pg emits 'error' when an idle client loses its connection)
// [KO] 연결 에러는 로그만 남기고 프로세스는 유지. 재연결은 ioredis·pg가 처리
redis.on('error', (error: Error) => {
  log('error', `Redis connection error: ${error.message}`);
});
pool.on('error', (error: Error) => {
  log('error', `PostgreSQL idle client error: ${error.message}`);
});

// [KO] Redis 연결이 준비될 때까지 기다린 뒤 워커 시작
if (redis.status !== 'ready') {
  await new Promise<void>((resolve) => redis.once('ready', resolve));
}

const worker = createOrderWorker({ redis, pool });
worker.start();

// [KO] 처리 중인 묶음을 끝낸 뒤 Redis·DB 연결을 정리하고 프로세스 종료
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  log('info', `Received ${signal}, shutting down`);
  await worker.stop();
  await redis.quit();
  await pool.end();
  // The handlers are registered once, so re-raising the signal now
  // terminates the process with the default behavior
  process.kill(process.pid, signal);
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => void shutdown(signal));
}
