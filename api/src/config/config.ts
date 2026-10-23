// [KO] 환경변수를 읽고 검증해 앱 설정 객체를 만든다. process.env는 이 파일에서만 읽는다

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
    // Logical database index
    db: number;
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
// [KO] 공백·빈 문자열은 undefined로 처리
function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

// [KO] ISO 8601 문자열을 epoch ms로 변환, 잘못된 값이면 부팅 실패
function parseTime(env: Env, name: string, fallback: number): number {
  const value = read(env, name);
  if (value === undefined) return fallback;
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    throw new Error(`${name} must be an ISO 8601 date-time, got "${value}"`);
  }
  return time;
}

// [KO] 재고는 0 이상의 정수만 허용
function parseStock(env: Env, name: string, fallback: number): number {
  const value = read(env, name);
  if (value === undefined) return fallback;
  const stock = Number(value);
  if (!Number.isInteger(stock) || stock < 0) {
    throw new Error(`${name} must be a non-negative integer, got "${value}"`);
  }
  return stock;
}

// [KO] Redis 논리 DB 번호는 0 이상의 정수만 허용
function parseRedisDb(env: Env, name: string, fallback: number): number {
  const value = read(env, name);
  if (value === undefined) return fallback;
  const db = Number(value);
  if (!Number.isInteger(db) || db < 0) {
    throw new Error(`${name} must be a non-negative integer, got "${value}"`);
  }
  return db;
}

// [KO] 'true'/'false' 문자열만 허용
function parseBoolean(env: Env, name: string, fallback: boolean): boolean {
  const value = read(env, name);
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be "true" or "false", got "${value}"`);
}

// [KO] now를 인자로 받아 테스트에서 기본 세일 시간(현재 ~ 1시간 후)을 고정할 수 있다
export function loadConfig(env: Env, now: number = Date.now()): AppConfig {
  const startAt = parseTime(env, 'SALE_START_AT', now);
  const endAt = parseTime(env, 'SALE_END_AT', now + DEFAULT_SALE_DURATION_MS);
  // [KO] 시작 시각은 종료 시각보다 빨라야 한다
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
      db: parseRedisDb(env, 'REDIS_DB', 0),
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

// [KO] 모듈 로드 시 한 번 생성되는 전역 설정
export const config: AppConfig = loadConfig(process.env);
