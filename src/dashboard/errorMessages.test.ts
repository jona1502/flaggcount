import { describe, expect, it } from 'vitest';
import { ERROR_MESSAGES, getErrorMessage } from './errorMessages';

describe('getErrorMessage', () => {
  it.each(Object.entries(ERROR_MESSAGES))('returns the German message for %s', (code, message) => {
    expect(getErrorMessage(code)).toBe(message);
  });

  it.each(['something-new', 'toString', ''])('falls back to the generic message for %j', (code) => {
    expect(getErrorMessage(code)).toBe(ERROR_MESSAGES.unknown);
  });
});
