import { describe, expect, it } from 'vitest';
import { getSaleStatus } from './sale-status.js';

describe('getSaleStatus', () => {
  const startAt = 1_000;
  const endAt = 2_000;

  it('is upcoming before the start', () => {
    expect(getSaleStatus(999, startAt, endAt)).toBe('upcoming');
  });

  it('is active exactly at the start', () => {
    expect(getSaleStatus(1_000, startAt, endAt)).toBe('active');
  });

  it('is active during the sale', () => {
    expect(getSaleStatus(1_500, startAt, endAt)).toBe('active');
  });

  it('is ended exactly at the end', () => {
    expect(getSaleStatus(2_000, startAt, endAt)).toBe('ended');
  });

  it('is ended after the end', () => {
    expect(getSaleStatus(2_001, startAt, endAt)).toBe('ended');
  });
});
