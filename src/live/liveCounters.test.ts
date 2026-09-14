import { describe, expect, it } from 'vitest';
import { createRedFlagCounter } from '../../shared/profiles';
import { createAppModel } from '../app-shell/appModel';
import { LICENSES, createAppState, createSettings, snapshotOf, teamPoll } from '../test/appStateFixtures';
import { liveCounters } from './liveCounters';

describe('liveCounters', () => {
  it('shows the first counter from the classic vote snapshot until counter snapshots arrive', () => {
    const state = createAppState({ counters: [], votes: { count: 3, target: 10, roundId: 'round-1', targetReached: false } });

    expect(liveCounters(createAppModel(state))).toEqual([
      expect.objectContaining({
        counterId: 'red-flags',
        mode: 'single',
        total: 3,
        target: 10,
        progress: 30,
        addressable: false,
        primary: true,
        redFlags: true
      })
    ]);
  });

  it('computes shares, colors and the leading option of a poll', () => {
    const poll = teamPoll();
    const settings = createSettings([createRedFlagCounter(5), poll]);
    const state = createAppState({ license: LICENSES.pro, settings, counters: [snapshotOf(settings.profiles[0]!.counters[0]!, [7]), snapshotOf(poll, [3, 1])] });

    const [flags, teams] = liveCounters(createAppModel(state));

    expect(flags).toMatchObject({ progress: 100, addressable: true, primary: true, redFlags: true });
    expect(teams).toMatchObject({ primary: false, redFlags: false, progress: null });
    expect(teams?.options.map(({ label, share, color, leading }) => ({ label, share, color, leading }))).toEqual([
      { label: 'Rot', share: 0.75, color: '#e82634', leading: true },
      { label: 'Blau', share: 0.25, color: '#2f80ed', leading: false }
    ]);
    expect(teams?.leaders.map((option) => option.label)).toEqual(['Rot']);
  });

  it('reports a tie and no leader without votes', () => {
    const poll = teamPoll();
    const model = (counts: number[]) =>
      createAppModel(createAppState({ license: LICENSES.pro, settings: createSettings([poll]), counters: [snapshotOf(poll, counts)] }));

    expect(liveCounters(model([2, 2]))[0]?.leaders).toHaveLength(2);
    expect(liveCounters(model([0, 0]))[0]?.leaders).toEqual([]);
  });
});
