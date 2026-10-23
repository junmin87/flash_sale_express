// Entry point: creates Redis and DB connections, initializes the sale settings,
// starts the HTTP server and handles shutdown signals

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
// Only log and keep the process running. ioredis and pg handle reconnects
redis.on('error', (error: Error) => {
  log('error', `Redis connection error: ${error.message}`);
});
pool.on('error', (error: Error) => {
  log('error', `PostgreSQL idle client error: ${error.message}`);
});

// The offline queue is disabled, so commands fail until the connection is
// ready. ioredis keeps reconnecting until then
if (redis.status !== 'ready') {
  await new Promise<void>((resolve) => redis.once('ready', resolve));
}

// Prepare the sale settings in Redis before opening the server
await createSaleService({ redis, pool }).initSale();

const app = createApp({ redis, pool });
const server = app.listen(config.port, (error) => {
  if (error) throw error;
  log('info', `API listening on port ${config.port}`);
});

// Stop new requests, close the Redis and DB connections, then exit
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
