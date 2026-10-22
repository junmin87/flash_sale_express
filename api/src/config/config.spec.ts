// [KO] loadConfig 유닛 테스트: 기본값·빈 문자열·잘못된 값 처리

import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const NOW = Date.parse('2026-10-21T00:00:00.000Z');
const HOUR = 60 * 60 * 1000;

describe('loadConfig', () => {
  it('uses defaults relative to now when sale variables are missing', () => {
    const config = loadConfig({}, NOW);

    expect(config.sale).toEqual({
      startAt: NOW,
      endAt: NOW + HOUR,
      stock: 100,
    });
    expect(config.productId).toBe('flash-sale-item');
    expect(config.adminEnabled).toBe(true);
  });

  it('treats empty strings as missing and uses defaults', () => {
    const config = loadConfig(
      {
        SALE_START_AT: '',
        SALE_END_AT: '',
        SALE_STOCK: '',
        PRODUCT_ID: '',
        ADMIN_ENABLED: '',
      },
      NOW,
    );

    expect(config.sale).toEqual({
      startAt: NOW,
      endAt: NOW + HOUR,
      stock: 100,
    });
    expect(config.productId).toBe('flash-sale-item');
    expect(config.adminEnabled).toBe(true);
  });

  it('reads provided sale variables', () => {
    const config = loadConfig(
      {
        SALE_START_AT: '2026-11-01T09:00:00Z',
        SALE_END_AT: '2026-11-01T10:00:00Z',
        SALE_STOCK: '5',
        PRODUCT_ID: 'item-1',
        ADMIN_ENABLED: 'false',
      },
      NOW,
    );

    expect(config.sale).toEqual({
      startAt: Date.parse('2026-11-01T09:00:00Z'),
      endAt: Date.parse('2026-11-01T10:00:00Z'),
      stock: 5,
    });
    expect(config.productId).toBe('item-1');
    expect(config.adminEnabled).toBe(false);
  });

  it('rejects invalid values', () => {
    expect(() => loadConfig({ SALE_START_AT: 'tomorrow' }, NOW)).toThrow();
    expect(() => loadConfig({ SALE_STOCK: '-1' }, NOW)).toThrow();
    expect(() => loadConfig({ SALE_STOCK: '1.5' }, NOW)).toThrow();
    expect(() => loadConfig({ ADMIN_ENABLED: 'yes' }, NOW)).toThrow();
    expect(() =>
      loadConfig(
        {
          SALE_START_AT: '2026-11-01T10:00:00Z',
          SALE_END_AT: '2026-11-01T10:00:00Z',
        },
        NOW,
      ),
    ).toThrow();
  });
});
