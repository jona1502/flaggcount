import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TARGET, MAX_TARGET, VotingService, isValidTarget, type VotingServiceOptions } from './VotingService';

function createService(options: VotingServiceOptions = {}): VotingService {
  let rounds = 0;
  return new VotingService({ createRoundId: () => `round-${++rounds}`, ...options });
}

describe('VotingService', () => {
  it('starts an empty round with the default target', () => {
    expect(createService().getSnapshot()).toEqual({
      count: 0,
      target: DEFAULT_TARGET,
      roundId: 'round-1',
      targetReached: false
    });
  });

  it.each(['🚩', '🚩🚩', 'Bitte 🚩'])('counts %j as exactly one vote', (comment) => {
    const service = createService();

    expect(service.handleComment('user-1', comment)).toBe('counted');
    expect(service.getSnapshot().count).toBe(1);
  });

  it('ignores further flags from the same user in the same round', () => {
    const service = createService();

    expect(service.handleComment('user-1', '🚩')).toBe('counted');
    expect(service.handleComment('user-1', '🚩🚩')).toBe('duplicate');
    expect(service.handleComment('user-1', 'nochmal 🚩')).toBe('duplicate');
    expect(service.handleComment('user-2', '🚩')).toBe('counted');

    expect(service.getSnapshot().count).toBe(2);
  });

  it('lets a user withdraw their vote with a white flag and vote again later', () => {
    const service = createService();

    expect(service.handleComment('user-1', '🚩')).toBe('counted');
    expect(service.handleComment('user-1', 'Ich nehme sie zurück 🏳️')).toBe('withdrawn');
    expect(service.getSnapshot().count).toBe(0);
    expect(service.hasVoted('user-1')).toBe(false);
    expect(service.handleComment('user-1', '🚩')).toBe('counted');
  });

  it('ignores a white flag from a user who has not voted', () => {
    const service = createService();
    const listener = vi.fn();
    service.subscribe(listener);

    expect(service.handleComment('user-1', '🏳️')).toBe('not-voted');
    expect(service.getSnapshot().count).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('treats a white flag as withdrawal when both flag types occur', () => {
    const service = createService();
    service.handleComment('user-1', '🚩');

    expect(service.handleComment('user-1', '🚩 🏳️')).toBe('withdrawn');
    expect(service.getSnapshot().count).toBe(0);
  });

  it('does not change the count for comments without a red flag', () => {
    const service = createService();

    expect(service.handleComment('user-1', 'Hallo')).toBe('no-flag');
    expect(service.getSnapshot().count).toBe(0);
    expect(service.hasVoted('user-1')).toBe(false);
    expect(service.handleComment('user-1', '🚩')).toBe('counted');
  });

  it('rejects votes without a user id', () => {
    const service = createService();

    expect(service.handleComment('', '🚩')).toBe('invalid-user');
    expect(service.handleComment('   ', '🚩')).toBe('invalid-user');
    expect(service.getSnapshot().count).toBe(0);
  });

  it('lets every user vote again after a reset', () => {
    const service = createService();
    service.handleComment('user-1', '🚩');
    service.handleComment('user-2', '🚩');

    const snapshot = service.reset();

    expect(snapshot).toEqual({ count: 0, target: DEFAULT_TARGET, roundId: 'round-2', targetReached: false });
    expect(service.hasVoted('user-1')).toBe(false);
    expect(service.handleComment('user-1', '🚩')).toBe('counted');
    expect(service.getSnapshot().count).toBe(1);
  });

  it('keeps manual votes when chat votes arrive and clears both on reset', () => {
    const service = createService();

    service.addManualVote();
    service.addManualVote();
    expect(service.handleComment('user-1', '🚩')).toBe('counted');
    expect(service.handleComment('user-1', '🚩')).toBe('duplicate');
    expect(service.getSnapshot().count).toBe(3);

    expect(service.reset().count).toBe(0);
  });

  it('supports changing the target', () => {
    const service = createService({ target: 5 });

    expect(service.setTarget(2)).toMatchObject({ target: 2, targetReached: false });
    service.handleComment('user-1', '🚩');
    service.handleComment('user-2', '🚩');

    expect(service.getSnapshot()).toMatchObject({ count: 2, target: 2, targetReached: true });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_TARGET + 1])('rejects the invalid target %s', (target) => {
    const service = createService({ target: 10 });

    expect(isValidTarget(target)).toBe(false);
    expect(() => service.setTarget(target)).toThrow(RangeError);
    expect(() => createService({ target })).toThrow(RangeError);
    expect(service.getSnapshot().target).toBe(10);
  });

  it('notifies listeners only when the state changes', () => {
    const service = createService({ target: 3 });
    const listener = vi.fn();
    service.subscribe(listener);

    service.handleComment('user-1', '🚩');
    service.handleComment('user-1', '🚩');
    service.handleComment('user-2', 'kein Flag');
    service.setTarget(3);
    service.setTarget(4);
    service.reset();

    expect(listener.mock.calls.map(([snapshot]) => snapshot)).toEqual([
      { count: 1, target: 3, roundId: 'round-1', targetReached: false },
      { count: 1, target: 4, roundId: 'round-1', targetReached: false },
      { count: 0, target: 4, roundId: 'round-2', targetReached: false }
    ]);
  });

  it('stops notifying after unsubscribing', () => {
    const service = createService();
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);

    unsubscribe();
    service.handleComment('user-1', '🚩');

    expect(listener).not.toHaveBeenCalled();
  });
});
