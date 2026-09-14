import { describe, expect, it } from 'vitest';
import { historyRound as round } from '../test/appStateFixtures';
import { filterHistory, historyProfiles, roundDuration, summarizeHistory } from './historySummary';

const records = [
  round(),
  round({ id: 'round-2', profileId: 'quiz', profileName: 'Quiz-Abend', counterName: 'Team-Wahl', mode: 'poll', target: null, targetReached: false, totalCount: 5 }),
  round({ id: 'round-3', profileId: 'quiz', profileName: 'Quiz', counterName: 'Richtig?', targetReached: false, totalCount: 1 })
];

describe('history summary', () => {
  it('summarizes rounds, votes, reached targets and the average', () => {
    expect(summarizeHistory(records)).toEqual({ rounds: 3, votes: 18, targetsReached: 1, averageVotes: 6 });
    expect(summarizeHistory([])).toEqual({ rounds: 0, votes: 0, targetsReached: 0, averageVotes: 0 });
  });

  it('shows the newest rounds first and filters by name and profile', () => {
    expect(filterHistory(records, { query: '', profileId: null }).map((record) => record.id)).toEqual(['round-3', 'round-2', 'round-1']);
    expect(filterHistory(records, { query: '  TEAM ', profileId: null }).map((record) => record.id)).toEqual(['round-2']);
    expect(filterHistory(records, { query: '', profileId: 'quiz' }).map((record) => record.id)).toEqual(['round-3', 'round-2']);
    expect(filterHistory(records, { query: 'flaggen', profileId: 'quiz' })).toEqual([]);
  });

  it('lists each profile once with its latest name', () => {
    expect(historyProfiles(records)).toEqual([
      { id: 'default', name: 'Standard' },
      { id: 'quiz', name: 'Quiz' }
    ]);
  });

  it('formats the duration of a round', () => {
    expect(roundDuration(round())).toBe('5 min 30 s');
    expect(roundDuration(round({ endedAt: '2026-09-10T18:00:42.000Z' }))).toBe('42 s');
    expect(roundDuration(round({ endedAt: '2026-09-10T19:02:00.000Z' }))).toBe('1 h 2 min');
  });
});
