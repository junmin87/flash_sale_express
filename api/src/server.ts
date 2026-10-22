import { createApp } from './app.js';
import { log } from './common/logger.js';
import { config } from './config/config.js';
import { createPool } from './infra/database.js';
import { createRedisClient } from './infra/redis.js';
import { createSaleService } from './services/sale.service.js';

const redis = createRedisClient();
const pool = createPool();

await createSaleService({ redis, pool }).initSale();

const app = createApp({ redis, pool });
const server = app.listen(config.port, (error) => {
  if (error) throw error;
  log('info', `API listening on port ${config.port}`);
});

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
