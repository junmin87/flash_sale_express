// Runs once before the integration tests: creates the test database if missing,
// and runs db/init.sql as is if the orders table is missing

import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import type { TestProject } from 'vitest/node';
import { config } from '../src/config/config.js';

// The schema is kept only in db/init.sql
const initSql = readFileSync(
  new URL('../../db/init.sql', import.meta.url),
  'utf8',
);

// Connects to the given database, runs the callback, then closes the connection
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

  // Connect to the postgres database, which always exists, and create the test
  // database if it is missing
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
