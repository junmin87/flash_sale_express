// GET /api/health integration tests (real Redis and PostgreSQL)

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { connect, disconnect } from './helpers.js';

describe('GET /api/health', () => {
  let clients: Awaited<ReturnType<typeof connect>>;
  let app: Express;

  beforeAll(async () => {
    clients = await connect();
    app = createApp({ redis: clients.redis, pool: clients.pool });
  });

  afterAll(async () => {
    await disconnect(clients);
  });

  it('reports Redis and PostgreSQL as ok', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.redis).toEqual({ ok: true, result: 'PONG' });
    expect(res.body.data.postgres).toEqual({ ok: true, result: 1 });
  });
});
