import { describe, expect, it } from 'vitest';
import { trimHistory, type RoundRecord } from './history';

describe('trimHistory', () => {
  it('keeps the newest records', () => {
    const records = Array.from({ length: 4 }, (_, i) => ({ id: String(i) })) as RoundRecord[];
    expect(trimHistory(records, 2).map(({ id }) => id)).toEqual(['2', '3']);
  });
});
