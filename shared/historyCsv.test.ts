import { expect, it } from 'vitest';
import { historyCsv } from './historyCsv';
import type { RoundRecord } from './history';

it('exports Excel CSV and neutralizes formulas', () => {
  const record = { schemaVersion: 1, id: '=cmd', profileName: '+Profil', counterName: 'A;B', mode: 'single', startedAt: 'a', endedAt: 'b', endReason: 'reset', target: null, targetReached: false, totalCount: 2, manualVotes: 0, options: [{ optionId: 'x', label: '@Option', count: 2 }], profileId: 'p', counterId: 'c' } satisfies RoundRecord;
  const csv = historyCsv([record]);
  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv).toContain('"\'=cmd"');
  expect(csv).toContain('"\'+Profil"');
  expect(csv).toContain('"A;B"');
  expect(csv).not.toContain('"=cmd"');
});
