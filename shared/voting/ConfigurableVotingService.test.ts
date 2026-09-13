import { describe, expect, it } from 'vitest';
import { DEFAULT_OVERLAY_SETTINGS } from '../settings';
import type { CounterDefinition } from '../profiles';
import { ConfigurableVotingService, matchesTrigger } from './ConfigurableVotingService';

const counter = (id: string, mode: CounterDefinition['mode'] = 'poll'): CounterDefinition => ({
  id, name: id, mode, target: 3,
  options: mode === 'single'
    ? [{ id: `${id}-red`, label: 'Rot', triggers: [{ kind: 'emoji', value: '🚩', match: 'contains' }], accentColor: '#ff0000' }]
    : [
        { id: `${id}-yes`, label: 'Ja', triggers: [{ kind: 'text', value: 'ja', match: 'word' }], accentColor: '#00ff00' },
        { id: `${id}-no`, label: 'Nein', triggers: [{ kind: 'text', value: 'nein', match: 'word' }], accentColor: '#ff0000' }
      ],
  withdrawalTriggers: [{ kind: 'emoji', value: '🏳️', match: 'contains' }], overlay: { ...DEFAULT_OVERLAY_SETTINGS }
});

describe('ConfigurableVotingService', () => {
  it('deduplicates, switches and withdraws a viewer vote', () => {
    const service = new ConfigurableVotingService([counter('poll')], { createRoundId: (() => { let n = 0; return () => `r${++n}`; })() });
    expect(service.handleComment('u1', 'JA')[0]?.result).toBe('counted');
    expect(service.handleComment('u1', 'ja')[0]?.result).toBe('duplicate');
    expect(service.handleComment('u1', 'nein')[0]?.result).toBe('switched');
    expect(service.getSnapshot('poll').options).toEqual([
      { optionId: 'poll-yes', label: 'Ja', count: 0 }, { optionId: 'poll-no', label: 'Nein', count: 1 }
    ]);
    expect(service.handleComment('u1', '🏳️')[0]?.result).toBe('withdrawn');
    expect(service.getSnapshot('poll').totalCount).toBe(0);
  });
  it('ignores ambiguous options but updates independent counters', () => {
    const service = new ConfigurableVotingService([counter('a'), counter('b', 'single')]);
    expect(service.handleComment('u1', 'ja 🚩')).toEqual([
      { counterId: 'a', result: 'counted' }, { counterId: 'b', result: 'counted' }
    ]);
    expect(service.handleComment('u2', 'ja nein')).toEqual([
      { counterId: 'a', result: 'ambiguous' }, { counterId: 'b', result: 'no-match' }
    ]);
  });
  it('matches Unicode words case-insensitively and emoji exactly', () => {
    expect(matchesTrigger({ kind: 'text', value: 'ja', match: 'word' }, 'JA!')).toBe(true);
    expect(matchesTrigger({ kind: 'text', value: 'ja', match: 'word' }, 'Jana')).toBe(false);
    expect(matchesTrigger({ kind: 'text', value: 'ja', match: 'contains' }, 'Jana')).toBe(true);
    expect(matchesTrigger({ kind: 'emoji', value: '🚩', match: 'contains' }, 'bitte 🚩🚩')).toBe(true);
  });
  it('supports option-assigned manual votes and independent resets', () => {
    const service = new ConfigurableVotingService([counter('a'), counter('b')]);
    service.addManualVote('a', 'a-no'); service.addManualVote('b', 'b-yes');
    const round = service.getSnapshot('b').roundId;
    service.reset('a');
    expect(service.getSnapshot('a').totalCount).toBe(0);
    expect(service.getSnapshot('b').totalCount).toBe(1);
    expect(service.getSnapshot('b').roundId).toBe(round);
  });
});
