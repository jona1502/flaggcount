// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPollCounter } from '../../shared/counterValidation';
import { createRedFlagCounter } from '../../shared/profiles';
import type { CounterSnapshot } from '../../shared/voting';
import { CountersBoard } from './CountersBoard';

afterEach(cleanup);

const poll = { ...createPollCounter('Welches Team?'), id: 'teams' };
const [red, blue] = poll.options.map((option, index) => ({ ...option, id: ['red', 'blue'][index] as string }));
const teams = { ...poll, options: [red!, blue!] };
const flags = createRedFlagCounter(10);

const snapshots: CounterSnapshot[] = [
  {
    counterId: 'red-flags',
    name: 'Rote Flaggen',
    mode: 'single',
    options: [{ optionId: 'red-flag', label: 'Rote Flagge', count: 4 }],
    totalCount: 4,
    target: 10,
    targetReached: false,
    roundId: 'r1'
  },
  {
    counterId: 'teams',
    name: 'Welches Team?',
    mode: 'poll',
    options: [
      { optionId: 'red', label: 'A', count: 3 },
      { optionId: 'blue', label: 'B', count: 1 }
    ],
    totalCount: 4,
    target: null,
    targetReached: false,
    roundId: 'r2'
  }
];

function renderBoard() {
  const props = {
    counters: snapshots,
    definitions: [flags, teams],
    disabled: false,
    onAddVote: vi.fn(),
    onRemoveVote: vi.fn(),
    onReset: vi.fn()
  };
  render(<CountersBoard {...props} />);
  return { props, user: userEvent.setup() };
}

describe('CountersBoard', () => {
  it('shows every running counter with its options, shares and chat triggers', () => {
    renderBoard();

    const flagsCard = screen.getByRole('article', { name: 'Rote Flaggen' });
    expect(within(flagsCard).getByText('von 10 Stimmen')).toBeTruthy();
    expect(within(flagsCard).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('4');

    const teamsCard = screen.getByRole('article', { name: 'Welches Team?' });
    expect(within(teamsCard).getByText('3 · 75 %')).toBeTruthy();
    expect(within(teamsCard).getByText('Im Chat: A')).toBeTruthy();
    expect(within(teamsCard).queryByRole('progressbar')).toBeNull();
  });

  it('corrects votes of a specific option', async () => {
    const { props, user } = renderBoard();

    await user.click(screen.getByRole('button', { name: 'Stimme für B hinzufügen' }));
    await user.click(screen.getByRole('button', { name: 'Stimme für A abziehen' }));
    await user.click(screen.getByRole('button', { name: 'Stimme für Rote Flaggen hinzufügen' }));

    expect(props.onAddVote.mock.calls).toEqual([
      ['teams', 'blue'],
      ['red-flags', 'red-flag']
    ]);
    expect(props.onRemoveVote).toHaveBeenCalledWith('teams', 'red');
  });

  it('resets one counter or all rounds only after confirmation', async () => {
    const { props, user } = renderBoard();

    await user.click(screen.getByRole('button', { name: 'Welches Team? zurücksetzen' }));
    expect(props.onReset).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Ja, zurücksetzen' }));
    expect(props.onReset).toHaveBeenLastCalledWith('teams');

    await user.click(screen.getByRole('button', { name: 'Alle Runden zurücksetzen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, alle zurücksetzen' }));
    expect(props.onReset).toHaveBeenLastCalledWith();
  });
});
