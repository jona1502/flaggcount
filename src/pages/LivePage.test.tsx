// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppError, AppState } from '../../shared/appState';
import { createSingleCounter } from '../../shared/counterValidation';
import { createRedFlagCounter, type CounterDefinition } from '../../shared/profiles';
import { Dashboard } from '../dashboard/Dashboard';
import { LICENSES, createActions, createAppState, createProfile, createSettings, snapshotOf, teamPoll } from '../test/appStateFixtures';

afterEach(cleanup);

function renderLive(state: AppState, error: AppError | null = null) {
  const actions = createActions();
  render(
    <Dashboard
      state={state}
      error={error}
      pending={false}
      actions={actions}
      onDismissError={() => undefined}
      onCopyText={async () => undefined}
      proAvailable
    />
  );
  const user = userEvent.setup();
  return {
    actions,
    user,
    open: () => user.click(within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getByRole('button', { name: 'Cockpit' }))
  };
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

function fourElements(): { counters: CounterDefinition[]; state: AppState } {
  const flags = createRedFlagCounter(10);
  const teams = teamPoll();
  const answer: CounterDefinition = {
    ...teamPoll('answer', 'Richtig oder falsch?'),
    options: [
      { id: 'yes', label: 'Richtig', triggers: [{ kind: 'text', value: 'richtig', match: 'word' }], accentColor: '#27ae60' },
      { id: 'no', label: 'Falsch', triggers: [{ kind: 'text', value: 'falsch', match: 'word' }], accentColor: '#f2994a' }
    ]
  };
  const fire = { ...createSingleCounter('Feuer', [{ kind: 'emoji', value: '🔥', match: 'contains' }], []), id: 'fire' };
  const counters = [flags, teams, answer, fire];
  const state = createAppState({
    license: LICENSES.pro,
    settings: createSettings(counters),
    counters: [snapshotOf(flags, [4]), snapshotOf(teams, [3, 1]), snapshotOf(answer, [2, 2]), snapshotOf(fire, [0])]
  });
  return { counters, state };
}

describe('Cockpit', () => {
  it('controls four elements at once with options, shares, leaders and targets', async () => {
    const { actions, user, open } = renderLive(fourElements().state);
    await open();

    const cards = screen.getAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('heading', { level: 2 }).textContent)).toEqual([
      'Rote Flaggen',
      'Team-Wahl',
      'Richtig oder falsch?',
      'Feuer'
    ]);
    expect(within(cards[1]!).getByText('Führt')).toBeTruthy();
    expect(within(cards[1]!).getByText('3 · 75 %')).toBeTruthy();
    expect(within(cards[2]!).getAllByText('Gleichstand')).toHaveLength(2);
    expect(within(cards[0]!).getByRole('progressbar', { name: 'Fortschritt von Rote Flaggen' }).getAttribute('aria-valuenow')).toBe('4');

    await user.click(button('Stimme für Blau hinzufügen'));
    await user.click(button('Stimme für Rote Flaggen abziehen'));
    expect(actions.addManualVote).toHaveBeenCalledWith('teams', 'blue');
    expect(actions.removeManualVote).toHaveBeenCalledWith('red-flags', 'red-flag');
    expect(button('Stimme für Feuer abziehen').disabled).toBe(true);
  });

  it('resets one element or all rounds only after confirmation', async () => {
    const { actions, user, open } = renderLive(fourElements().state);
    await open();

    await user.click(button('Team-Wahl zurücksetzen'));
    const dialog = screen.getByRole('dialog', { name: '„Team-Wahl“ zurücksetzen?' });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    await user.click(within(dialog).getByRole('button', { name: 'Ja, zurücksetzen' }));
    expect(actions.resetVotes).toHaveBeenLastCalledWith('teams');

    await user.click(button('Alle Runden zurücksetzen'));
    await user.click(screen.getByRole('button', { name: 'Ja, alle zurücksetzen' }));
    expect(actions.resetVotes).toHaveBeenLastCalledWith();
    expect(actions.resetVotes).toHaveBeenCalledTimes(2);
  });

  it('switches the running profile only after confirming that rounds end', async () => {
    const settings = createSettings(undefined, [createProfile('quiz', 'Quiz-Abend', [teamPoll()])]);
    const { actions, user, open } = renderLive(createAppState({ license: LICENSES.pro, settings }));
    await open();

    await user.selectOptions(screen.getByLabelText('Profil'), 'quiz');
    expect(actions.switchProfile).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog', { name: 'Zu „Quiz-Abend“ wechseln?' })).getByRole('button', { name: 'Ja, wechseln' }));

    expect(actions.switchProfile).toHaveBeenCalledWith('quiz');
  });

  it('keeps the Free counter working and explains elements paused after a downgrade', async () => {
    const flags = createRedFlagCounter(10);
    const state = createAppState({
      license: LICENSES.expired,
      settings: createSettings([flags, teamPoll()]),
      counters: [snapshotOf(flags, [1])]
    });
    const { actions, user, open } = renderLive(state);
    await open();

    const paused = screen.getByRole('note', { name: '1 Element läuft gerade nicht' });
    expect(paused.textContent).toContain('„Team-Wahl“ braucht Audience Live Pro');
    await user.click(button('Flagge hinzufügen'));
    expect(actions.addManualVote).toHaveBeenCalledWith('red-flags', 'red-flag');
  });

  it('leads a single counter to creating a poll', async () => {
    const { user, open } = renderLive(createAppState());
    await open();

    await user.click(button('Abstimmung erstellen'));

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Zähler & Abstimmungen');
    expect(screen.getByRole('dialog', { name: 'Neues Element' })).toBeTruthy();
  });

  it('offers to reconnect after the stream ended', async () => {
    const state = createAppState({ settings: { ...createSettings(), username: 'streamer' } });
    const { actions, user, open } = renderLive(state, { code: 'stream-ended', message: 'The stream ended' });
    await open();

    await user.click(within(screen.getByRole('note', { name: 'Der LIVE ist beendet oder nicht mehr erreichbar' })).getByRole('button', { name: 'Erneut verbinden' }));

    expect(actions.connect).toHaveBeenCalledWith('streamer');
  });
});
