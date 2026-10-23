// Creates the PostgreSQL connection pool from config

import { Pool } from 'pg';
import { config } from '../config/config.js';

export function createPool(): Pool {
  return new Pool({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.name,
  });
}
