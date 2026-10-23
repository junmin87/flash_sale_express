// [KO] 진입점: Redis·DB 연결 생성, 세일 설정 초기화, HTTP 서버 시작, 종료 시그널 처리

import { createApp } from './app.js';
import { log } from './common/logger.js';
import { config } from './config/config.js';
import { createPool } from './infra/database.js';
import { createRedisClient } from './infra/redis.js';
import { createSaleService } from './services/sale.service.js';

const redis = createRedisClient();
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

// The offline queue is disabled, so commands fail until the connection is
// ready. ioredis keeps reconnecting until then
// [KO] Redis 연결이 준비될 때까지 기다린 뒤 initSale 실행
if (redis.status !== 'ready') {
  await new Promise<void>((resolve) => redis.once('ready', resolve));
}

// [KO] 서버를 열기 전에 Redis에 세일 설정을 준비한다
await createSaleService({ redis, pool }).initSale();

const app = createApp({ redis, pool });
const server = app.listen(config.port, (error) => {
  if (error) throw error;
  log('info', `API listening on port ${config.port}`);
});

// [KO] 새 요청을 막고 Redis·DB 연결을 정리한 뒤 프로세스 종료
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  log('info', `Received ${signal}, shutting down`);
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await redis.quit();
  await pool.end();
  // The handlers are registered once, so re-raising the signal now
  // terminates the process with the default behavior
  process.kill(process.pid, signal);
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => void shutdown(signal));
}
