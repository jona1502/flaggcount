import { describe, expect, it, vi } from 'vitest';
import { createRedFlagCounter, type CounterDefinition } from '../profiles';
import { DEFAULT_OVERLAY_SETTINGS } from '../settings';
import { VotingEngine, toVoteSnapshot } from './VotingEngine';

function poll(id = 'poll', words = ['a', 'b', 'c']): CounterDefinition {
  return {
    id,
    name: 'Umfrage',
    mode: 'poll',
    target: null,
    options: words.map((word) => ({
      id: word,
      label: word.toUpperCase(),
      triggers: [{ kind: 'text', value: word, match: 'word' }],
      accentColor: '#112233'
    })),
    withdrawalTriggers: [{ kind: 'text', value: 'zurück', match: 'word' }],
    overlay: { ...DEFAULT_OVERLAY_SETTINGS }
  };
}

function createEngine(definitions: CounterDefinition[]) {
  let rounds = 0;
  const engine = new VotingEngine(definitions, { createRoundId: () => `round-${++rounds}` });
  const counts = (counterId: string) => engine.getSnapshot(counterId)?.options.map((option) => option.count);
  const resultOf = (userId: string, comment: string, counterId = definitions[0]?.id) =>
    engine.handleComment(userId, comment).find((result) => result.counterId === counterId)?.result;
  return { engine, counts, resultOf };
}

describe('VotingEngine', () => {
  describe('single counter', () => {
    it('counts one vote per viewer and lets them withdraw and vote again', () => {
      const { engine, resultOf } = createEngine([createRedFlagCounter(3)]);

      expect(resultOf('1', '🚩🚩')).toBe('counted');
      expect(resultOf('1', 'nochmal 🚩')).toBe('duplicate');
      expect(resultOf('2', 'Hallo')).toBe('no-match');
      expect(resultOf('1', '🚩 🏳️')).toBe('withdrawn');
      expect(resultOf('1', '🏳')).toBe('not-voted');
      expect(resultOf('1', '🚩')).toBe('counted');
      expect(resultOf(' ', '🚩')).toBe('invalid-user');

      expect(engine.getSnapshot('red-flags')).toEqual({
        counterId: 'red-flags',
        name: 'Rote Flaggen',
        mode: 'single',
        options: [{ optionId: 'red-flag', label: 'Rote Flagge', count: 1 }],
        totalCount: 1,
        target: 3,
        targetReached: false,
        roundId: 'round-1'
      });
    });

    it('adds and subtracts manual votes without an option id', () => {
      const { engine, counts, resultOf } = createEngine([createRedFlagCounter()]);

      resultOf('1', '🚩');
      expect(engine.addManualVote('red-flags')).toBe(true);
      expect(engine.removeManualVote('red-flags')).toBe(true);
      expect(engine.removeManualVote('red-flags')).toBe(true);
      expect(counts('red-flags')).toEqual([0]);
      expect(engine.removeManualVote('red-flags')).toBe(false);
      expect(engine.hasVoted('red-flags', '1')).toBe(true);

      // The real withdrawal absorbs the correction, so the next vote counts again.
      resultOf('1', '🏳️');
      resultOf('1', '🚩');
      expect(counts('red-flags')).toEqual([1]);
    });
  });

  describe('polls', () => {
    it('moves a viewer’s vote to the newly chosen option', () => {
      const { counts, resultOf } = createEngine([poll()]);

      expect(resultOf('1', 'ich nehme a')).toBe('counted');
      expect(resultOf('2', 'B!')).toBe('counted');
      expect(resultOf('1', 'doch lieber b')).toBe('moved');
      expect(resultOf('1', 'b b b')).toBe('duplicate');

      expect(counts('poll')).toEqual([0, 2, 0]);
    });

    it('ignores messages that match several options of the same counter', () => {
      const { engine, counts, resultOf } = createEngine([poll()]);

      expect(resultOf('1', 'a oder b?')).toBe('ambiguous');
      expect(engine.hasVoted('poll', '1')).toBe(false);
      resultOf('1', 'a');
      expect(resultOf('1', 'a oder b?')).toBe('ambiguous');
      expect(counts('poll')).toEqual([1, 0, 0]);
    });

    it('withdraws the vote from whichever option the viewer chose', () => {
      const { counts, resultOf } = createEngine([poll()]);
      resultOf('1', 'c');

      expect(resultOf('1', 'c zurück')).toBe('withdrawn');
      expect(counts('poll')).toEqual([0, 0, 0]);
    });

    it('needs an existing option for manual votes', () => {
      const { engine, counts } = createEngine([poll()]);

      expect(engine.addManualVote('poll')).toBe(false);
      expect(engine.addManualVote('poll', 'nope')).toBe(false);
      expect(engine.addManualVote('missing', 'a')).toBe(false);
      expect(engine.addManualVote('poll', 'b')).toBe(true);
      expect(engine.removeManualVote('poll', 'a')).toBe(false);

      expect(counts('poll')).toEqual([0, 1, 0]);
    });

    it('never reaches a target it does not have', () => {
      const { engine } = createEngine([poll()]);
      engine.addManualVote('poll', 'a');

      expect(engine.getSnapshot('poll')).toMatchObject({ totalCount: 1, target: null, targetReached: false });
      engine.setTarget('poll', 1);
      expect(engine.getSnapshot('poll')?.targetReached).toBe(true);
      expect(() => engine.setTarget('poll', 0)).toThrow(RangeError);
    });
  });

  describe('parallel counters', () => {
    it('updates every counter a message matches unambiguously, once per notification', () => {
      const { engine, counts } = createEngine([createRedFlagCounter(), poll('teams', ['rot', 'blau'])]);
      const listener = vi.fn();
      engine.subscribe(listener);

      const results = engine.handleComment('1', '🚩 rot');

      expect(results).toEqual([
        { counterId: 'red-flags', result: 'counted' },
        { counterId: 'teams', result: 'counted' }
      ]);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(counts('red-flags')).toEqual([1]);
      expect(counts('teams')).toEqual([1, 0]);

      engine.handleComment('2', 'nichts');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('resets one counter without touching the others', () => {
      const { engine, resultOf } = createEngine([createRedFlagCounter(), poll()]);
      resultOf('1', '🚩', 'red-flags');
      resultOf('1', 'a', 'poll');

      engine.reset('poll');

      expect(engine.getSnapshot('red-flags')).toMatchObject({ totalCount: 1, roundId: 'round-1' });
      expect(engine.getSnapshot('poll')).toMatchObject({ totalCount: 0, roundId: 'round-3' });
      expect(engine.reset('missing')).toBe(false);

      engine.reset();
      expect(engine.getSnapshots().map((counter) => [counter.totalCount, counter.roundId])).toEqual([
        [0, 'round-4'],
        [0, 'round-5']
      ]);
    });
  });

  describe('configure', () => {
    it('keeps the round and the votes of options that still exist', () => {
      const { engine, counts, resultOf } = createEngine([poll()]);
      resultOf('1', 'a');
      resultOf('2', 'b');
      engine.addManualVote('poll', 'b');

      engine.configure([poll('poll', ['a', 'b']), createRedFlagCounter()]);

      expect(engine.getSnapshot('poll')?.roundId).toBe('round-1');
      expect(counts('poll')).toEqual([1, 2]);
      expect(engine.getSnapshot('red-flags')?.roundId).toBe('round-2');

      engine.configure([poll('poll', ['b', 'c'])]);
      expect(counts('poll')).toEqual([2, 0]);
      // Viewer 1 voted for the removed option and may vote again.
      expect(resultOf('1', 'c')).toBe('counted');
    });

    it('only notifies when the visible state changes', () => {
      const { engine } = createEngine([poll()]);
      const listener = vi.fn();
      engine.subscribe(listener);

      engine.configure([poll()]);
      expect(listener).not.toHaveBeenCalled();

      engine.configure([{ ...poll(), name: 'Neue Frage' }]);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  it('never exposes viewer identities in snapshots', () => {
    const { engine } = createEngine([createRedFlagCounter(), poll()]);
    engine.handleComment('viewer-4711', '🚩 a');

    expect(JSON.stringify(engine.getSnapshots())).not.toContain('4711');
  });

  it('converts a counter into the single-count snapshot of 0.2', () => {
    const { engine } = createEngine([createRedFlagCounter(2)]);
    engine.addManualVote('red-flags');
    engine.addManualVote('red-flags');

    const snapshot = engine.getSnapshot('red-flags');
    expect(snapshot && toVoteSnapshot(snapshot)).toEqual({ count: 2, target: 2, roundId: 'round-1', targetReached: true });
  });
});
