// [KO] userIdSchema 검증 규칙 유닛 테스트

import { describe, expect, it } from 'vitest';
import { userIdSchema } from './purchase.validator.js';

function validateUserId(userId: unknown) {
  return userIdSchema.validate({ userId }, { abortEarly: false });
}

describe('userIdSchema', () => {
  it('accepts a valid userId', () => {
    const { error, value } = validateUserId('junmin');
    expect(error).toBeUndefined();
    expect(value).toEqual({ userId: 'junmin' });
  });

  it('trims surrounding whitespace', () => {
    const { error, value } = validateUserId('  junmin  ');
    expect(error).toBeUndefined();
    expect(value).toEqual({ userId: 'junmin' });
  });

  it('rejects a missing userId', () => {
    expect(userIdSchema.validate({}).error).toBeDefined();
  });

  it('rejects an empty string', () => {
    expect(validateUserId('').error).toBeDefined();
  });

  it('rejects whitespace only', () => {
    expect(validateUserId('   ').error).toBeDefined();
  });

  it('accepts 64 characters and rejects 65', () => {
    expect(validateUserId('a'.repeat(64)).error).toBeUndefined();
    expect(validateUserId('a'.repeat(65)).error).toBeDefined();
  });

  it('rejects a non-string userId', () => {
    expect(validateUserId(123).error).toBeDefined();
  });
});
