export interface AppConfig {
  port: number;
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
  };
  redis: {
    host: string;
    port: number;
  };
  sale: {
    // Epoch milliseconds
    startAt: number;
    endAt: number;
    stock: number;
  };
  productId: string;
  adminEnabled: boolean;
}

type Env = Record<string, string | undefined>;

const DEFAULT_SALE_DURATION_MS = 60 * 60 * 1000;
const DEFAULT_SALE_STOCK = 100;

// docker compose passes unset variables as empty strings, so treat them as missing
function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function parseTime(env: Env, name: string, fallback: number): number {
  const value = read(env, name);
  if (value === undefined) return fallback;
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    throw new Error(`${name} must be an ISO 8601 date-time, got "${value}"`);
  }
  return time;
}

function parseStock(env: Env, name: string, fallback: number): number {
  const value = read(env, name);
  if (value === undefined) return fallback;
  const stock = Number(value);
  if (!Number.isInteger(stock) || stock < 0) {
    throw new Error(`${name} must be a non-negative integer, got "${value}"`);
  }
  return stock;
}

function parseBoolean(env: Env, name: string, fallback: boolean): boolean {
  const value = read(env, name);
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be "true" or "false", got "${value}"`);
}

export function loadConfig(env: Env, now: number = Date.now()): AppConfig {
  const startAt = parseTime(env, 'SALE_START_AT', now);
  const endAt = parseTime(env, 'SALE_END_AT', now + DEFAULT_SALE_DURATION_MS);
  if (startAt >= endAt) {
    throw new Error('SALE_START_AT must be earlier than SALE_END_AT');
  }

  return {
    port: Number(env.PORT ?? 3000),
    database: {
      host: env.DATABASE_HOST ?? 'localhost',
      port: Number(env.DATABASE_PORT ?? 5432),
      user: env.DATABASE_USER ?? 'flashsale',
      password: env.DATABASE_PASSWORD ?? 'flashsale',
      name: env.DATABASE_NAME ?? 'flashsale',
    },
    redis: {
      host: env.REDIS_HOST ?? 'localhost',
      port: Number(env.REDIS_PORT ?? 6379),
    },
    sale: {
      startAt,
      endAt,
      stock: parseStock(env, 'SALE_STOCK', DEFAULT_SALE_STOCK),
    },
    productId: read(env, 'PRODUCT_ID') ?? 'flash-sale-item',
    adminEnabled: parseBoolean(env, 'ADMIN_ENABLED', true),
  };
}

export const config: AppConfig = loadConfig(process.env);
