import { describe, expect, it } from 'vitest';
import { containsRedFlag } from './redFlag';

describe('containsRedFlag', () => {
  it.each(['🚩', '🚩🚩', 'Bitte 🚩', 'abc🚩def', '🚩️'])('detects the flag in %j', (comment) => {
    expect(containsRedFlag(comment)).toBe(true);
  });

  it.each(['', 'Bitte', 'red flag', ':red_flag:', '🏁', '🏳️', '🇩🇪'])('ignores %j', (comment) => {
    expect(containsRedFlag(comment)).toBe(false);
  });
});
