// Order worker entry point: creates Redis and DB connections, starts the worker
// and handles shutdown signals. No HTTP server

import { Redis } from 'ioredis';
import { log } from './common/logger.js';
import { config } from './config/config.js';
import { createPool } from './infra/database.js';
import { createOrderWorker } from './workers/order.worker.js';

// A separate client without commandTimeout, because XREADGROUP blocks for
// longer than the API client's 1 second timeout
// Fail commands right away while disconnected, so the worker loop logs and
// retries
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  db: config.redis.db,
  enableOfflineQueue: false,
});
const pool = createPool();

// Without listeners these errors are printed by ioredis or crash the
// process (pg emits 'error' when an idle client loses its connection)
// Only log and keep the process running. ioredis and pg handle reconnects
redis.on('error', (error: Error) => {
  log('error', `Redis connection error: ${error.message}`);
});
pool.on('error', (error: Error) => {
  log('error', `PostgreSQL idle client error: ${error.message}`);
});

if (redis.status !== 'ready') {
  await new Promise<void>((resolve) => redis.once('ready', resolve));
}

const worker = createOrderWorker({ redis, pool });
worker.start();

// Finish the current batch, close the Redis and DB connections, then exit
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
