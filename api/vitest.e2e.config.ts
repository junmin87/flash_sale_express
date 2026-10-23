// Integration test config. Uses the same Redis and PostgreSQL containers as the
// running services, but Redis DB 1 and the flashsale_test database. Test files
// share that storage, so they run one at a time

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    // Keeps tests away from the data of the running services (Redis DB 0,
    // database flashsale)
    env: {
      REDIS_DB: '1',
      DATABASE_NAME: 'flashsale_test',
    },
    globalSetup: ['test/global-setup.ts'],
    // All files share one Redis and one database
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
