// [KO] 통합 테스트 설정. 실행 중인 서비스와 같은 Redis·PostgreSQL 컨테이너를 쓰되 Redis 1번 DB, flashsale_test DB로 분리한다. 테스트 파일끼리는 저장 공간을 공유하므로 순서대로 실행한다

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
