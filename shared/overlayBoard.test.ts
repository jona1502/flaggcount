import { describe, expect, it } from 'vitest';
import { createPollCounter } from './counterValidation';
import { buildCounterViews, parseCounterViews } from './overlayBoard';
import { createRedFlagCounter } from './profiles';
import { DEFAULT_OVERLAY_SETTINGS } from './settings';
import type { CounterSnapshot } from './voting';

const poll = { ...createPollCounter('Team?'), id: 'teams' };
const snapshots: CounterSnapshot[] = [
  {
    counterId: 'teams',
    name: 'Team?',
    mode: 'poll',
    options: poll.options.map((option, index) => ({ optionId: option.id, label: option.label, count: index + 1 })),
    totalCount: 3,
    target: null,
    targetReached: false,
    roundId: 'r1'
  },
  {
    counterId: 'removed',
    name: 'Ohne Definition',
    mode: 'single',
    options: [{ optionId: 'o', label: 'O', count: 0 }],
    totalCount: 0,
    target: 5,
    targetReached: false,
    roundId: 'r2'
  }
];

describe('buildCounterViews', () => {
  it('combines counts with option colors and the counter design, without round ids', () => {
    const views = buildCounterViews(snapshots, [poll, createRedFlagCounter()]);

    expect(views[0]).toEqual({
      counterId: 'teams',
      name: 'Team?',
      mode: 'poll',
      options: [
        { optionId: poll.options[0]!.id, label: 'A', count: 1, color: '#e82634' },
        { optionId: poll.options[1]!.id, label: 'B', count: 2, color: '#2f80ed' }
      ],
      totalCount: 3,
      target: null,
      targetReached: false,
      overlay: DEFAULT_OVERLAY_SETTINGS
    });
    expect(views[1]?.options[0]?.color).toBe(DEFAULT_OVERLAY_SETTINGS.accentColor);
    expect(JSON.stringify(views)).not.toContain('roundId');
  });
});

describe('parseCounterViews', () => {
  it('accepts built views and an empty list', () => {
    const views = buildCounterViews(snapshots, [poll]);

    expect(parseCounterViews(JSON.parse(JSON.stringify(views)))).toEqual(views);
    expect(parseCounterViews([])).toEqual([]);
  });

  it.each([
    null,
    'views',
    Array(5).fill(buildCounterViews(snapshots, [poll])[0]),
    [{ ...buildCounterViews(snapshots, [poll])[0], counterId: '<script>' }],
    [{ ...buildCounterViews(snapshots, [poll])[0], name: 'x'.repeat(61) }],
    [{ ...buildCounterViews(snapshots, [poll])[0], totalCount: -1 }],
    [{ ...buildCounterViews(snapshots, [poll])[0], options: [] }],
    [{ ...buildCounterViews(snapshots, [poll])[0], options: [{ optionId: 'a', label: 'A', count: 1, color: 'red' }] }],
    [{ ...buildCounterViews(snapshots, [poll])[0], overlay: { size: 5 } }]
  ])('rejects %j', (value) => {
    expect(parseCounterViews(value)).toBeNull();
  });
});
