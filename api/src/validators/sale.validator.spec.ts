// [KO] setSaleSchema 검증 규칙 유닛 테스트

import { describe, expect, it } from 'vitest';
import { setSaleSchema } from './sale.validator.js';

function errorsFor(body: object) {
  const { error } = setSaleSchema.validate(body, { abortEarly: false });
  return [...new Set((error?.details ?? []).map((detail) => detail.path[0]))];
}

const valid = {
  startAt: '2026-11-01T09:00:00Z',
  endAt: '2026-11-01T10:00:00Z',
  stock: 10,
};

describe('setSaleSchema', () => {
  it('accepts a valid body', () => {
    expect(errorsFor(valid)).toEqual([]);
  });

  it('accepts zero stock', () => {
    expect(errorsFor({ ...valid, stock: 0 })).toEqual([]);
  });

  it('rejects startAt equal to endAt', () => {
    expect(errorsFor({ ...valid, endAt: valid.startAt })).toEqual(['endAt']);
  });

  it('rejects startAt after endAt', () => {
    expect(
      errorsFor({
        ...valid,
        startAt: valid.endAt,
        endAt: valid.startAt,
      }),
    ).toEqual(['endAt']);
  });

  it('rejects negative stock', () => {
    expect(errorsFor({ ...valid, stock: -1 })).toEqual(['stock']);
  });

  it('rejects non-integer stock', () => {
    expect(errorsFor({ ...valid, stock: 1.5 })).toEqual(['stock']);
    expect(errorsFor({ ...valid, stock: '10' })).toEqual(['stock']);
  });
});
