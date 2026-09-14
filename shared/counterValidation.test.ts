import { describe, expect, it } from 'vitest';
import {
  appendPollOption,
  changeCounterMode,
  createPollCounter,
  createPollOption,
  createSingleCounter,
  duplicateCounter,
  findCounterProblems
} from './counterValidation';
import { requiredFeatures } from './entitlements';
import { createRedFlagCounter, parseCounterDefinition, type CounterDefinition } from './profiles';

describe('findCounterProblems', () => {
  it('accepts the red flag counter and a fresh poll', () => {
    expect(findCounterProblems(createRedFlagCounter())).toEqual([]);
    expect(findCounterProblems(createPollCounter())).toEqual([]);
  });

  it('agrees with the parser about valid counters', () => {
    const poll = createPollCounter('Welches Team?');

    expect(parseCounterDefinition(poll)).not.toBeNull();
    expect(parseCounterDefinition({ ...poll, options: [poll.options[0]] })).toBeNull();
    expect(findCounterProblems({ ...poll, options: [poll.options[0]!] })).toEqual([{ code: 'option-count', min: 2, max: 6 }]);
  });

  it('names every option a duplicate trigger belongs to', () => {
    const poll = createPollCounter();
    const [a, b] = poll.options as [CounterDefinition['options'][0], CounterDefinition['options'][0]];
    const conflicting: CounterDefinition = {
      ...poll,
      options: [a, { ...b, triggers: [{ kind: 'text', value: ' a ', match: 'contains' }] }],
      withdrawalTriggers: [{ kind: 'text', value: 'A', match: 'word' }]
    };

    expect(findCounterProblems(conflicting)).toEqual([
      {
        code: 'duplicate-trigger',
        value: 'A',
        owners: [
          { kind: 'option', optionId: a.id, label: 'A' },
          { kind: 'option', optionId: b.id, label: 'B' },
          { kind: 'withdrawal' }
        ]
      }
    ]);
  });

  it('reports names, targets, labels, colors and missing or invalid triggers', () => {
    const poll = createPollCounter();
    const [a, b] = poll.options as [CounterDefinition['options'][0], CounterDefinition['options'][0]];
    const broken: CounterDefinition = {
      ...poll,
      name: '  ',
      target: 0,
      options: [
        { ...a, label: '', accentColor: 'rot' },
        { ...b, triggers: [{ kind: 'emoji', value: 'ja', match: 'contains' }] }
      ]
    };

    expect(findCounterProblems(broken)).toEqual([
      { code: 'invalid-name' },
      { code: 'invalid-target' },
      { code: 'invalid-label', optionId: a.id },
      { code: 'invalid-color', optionId: a.id },
      { code: 'invalid-trigger', owner: { kind: 'option', optionId: b.id, label: 'B' }, value: 'ja' }
    ]);
    expect(findCounterProblems({ ...poll, options: [a, { ...b, triggers: [] }] })).toEqual([
      { code: 'missing-trigger', optionId: b.id, label: 'B' }
    ]);
  });
});

describe('poll factories', () => {
  it('creates distinct options named by letter', () => {
    const third = createPollOption(2);

    expect(third).toMatchObject({ label: 'C', triggers: [{ kind: 'text', value: 'C', match: 'word' }] });
    expect(third.id).not.toBe(createPollOption(2).id);
    expect(third.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it('turns a single counter into a poll and back without losing the first option', () => {
    const flags = createRedFlagCounter(20);

    const poll = changeCounterMode(flags, 'poll');
    expect(poll.options).toHaveLength(2);
    expect(poll.options[0]).toEqual(flags.options[0]);
    expect(findCounterProblems(poll)).toEqual([]);

    const single = changeCounterMode(poll, 'single');
    expect(single.options).toEqual([flags.options[0]]);
    expect(changeCounterMode(single, 'single')).toBe(single);
  });
});

describe('counter creation helpers', () => {
  it('creates a single counter Free can run and one with custom triggers', () => {
    const flags = createSingleCounter('Flaggen');
    expect(findCounterProblems(flags)).toEqual([]);
    expect(parseCounterDefinition(flags)).not.toBeNull();
    expect(requiredFeatures(flags)).toEqual([]);

    const fire = createSingleCounter('Feuer', [{ kind: 'emoji', value: '🔥', match: 'contains' }], []);
    expect(requiredFeatures(fire)).toEqual(['custom-triggers']);
    expect(fire.id).not.toBe(flags.id);
  });

  it('duplicates a counter with new ids and a marked name within the length limit', () => {
    const poll = createPollCounter('Welches Team?');
    const copy = duplicateCounter(poll);

    expect(copy.name).toBe('Welches Team? (Kopie)');
    expect(copy.id).not.toBe(poll.id);
    expect(copy.options.map((option) => option.id)).not.toEqual(poll.options.map((option) => option.id));
    expect(copy.options.map((option) => option.triggers)).toEqual(poll.options.map((option) => option.triggers));
    expect(parseCounterDefinition(copy)).not.toBeNull();
    expect([...duplicateCounter({ ...poll, name: 'x'.repeat(60) }).name]).toHaveLength(60);
  });

  it('appends lettered options without reusing a trigger of the counter', () => {
    const poll = createPollCounter();
    expect(appendPollOption(poll).options[2]).toMatchObject({ label: 'C', triggers: [{ kind: 'text', value: 'C', match: 'word' }] });

    const taken: CounterDefinition = { ...poll, withdrawalTriggers: [{ kind: 'text', value: 'c', match: 'word' }] };
    expect(appendPollOption(taken).options[2]?.triggers).toEqual([]);
  });
});
