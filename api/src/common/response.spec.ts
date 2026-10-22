import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ok } from './response.js';

describe('ok', () => {
  it('wraps the data in { success: true, data }', () => {
    const res = { json: vi.fn() };

    ok(res as unknown as Response, { hello: 'world' });

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { hello: 'world' },
    });
  });
});
