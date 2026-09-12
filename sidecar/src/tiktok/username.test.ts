import { describe, expect, it } from 'vitest';
import { normalizeUsername } from './username';

describe('normalizeUsername', () => {
  it.each([
    ['streamer', 'streamer'],
    ['  @Streamer.Name_1 ', 'streamer.name_1'],
    ['https://www.tiktok.com/@streamer/live', 'streamer'],
    ['tiktok.com/@streamer?lang=de', 'streamer']
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeUsername(input)).toBe(expected);
  });

  it.each(['', '@', 'a', 'name with space', 'x'.repeat(25), 'bad/name', 'flag🚩'])('rejects %j', (input) => {
    expect(normalizeUsername(input)).toBeNull();
  });
});
