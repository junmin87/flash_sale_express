// [KO] 통합 테스트 시작 전 1회: 테스트 DB가 없으면 만들고, orders 테이블이 없으면 db/init.sql을 그대로 실행한다

import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import type { TestProject } from 'vitest/node';
import { config } from '../src/config/config.js';

// The schema is kept only in db/init.sql
const initSql = readFileSync(
  new URL('../../db/init.sql', import.meta.url),
  'utf8',
);

// [KO] 지정한 DB에 연결해 작업 후 연결을 닫는다
async function withClient<T>(
  database: string,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database,
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export default async function setup(project: TestProject): Promise<void> {
  // globalSetup runs in the main process, which does not get test.env
  const database = project.config.env.DATABASE_NAME;
  if (!database) {
    throw new Error('DATABASE_NAME must be set in vitest.e2e.config.ts');
  }

  // [KO] 항상 존재하는 postgres DB에 연결해 테스트 DB 존재 여부 확인 후 생성
  await withClient('postgres', async (client) => {
    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [database],
    );
    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE "${database}"`);
    }
  });

  await withClient(database, async (client) => {
    const result = await client.query(
      "SELECT to_regclass('public.orders') AS orders",
    );
    if (result.rows[0].orders === null) {
      await client.query(initSql);
    }
  });
}
