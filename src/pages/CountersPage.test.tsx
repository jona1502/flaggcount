// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppState } from '../../shared/appState';
import { createRedFlagCounter, type CounterDefinition } from '../../shared/profiles';
import { Dashboard } from '../dashboard/Dashboard';
import { LICENSES, createActions, createAppState, createSettings, teamPoll } from '../test/appStateFixtures';

afterEach(cleanup);

type User = ReturnType<typeof userEvent.setup>;

function renderCounters(state: AppState) {
  const actions = createActions();
  const element = (next: AppState) => (
    <Dashboard
      state={next}
      error={null}
      pending={false}
      actions={actions}
      onDismissError={() => undefined}
      onCopyText={async () => undefined}
      proAvailable
    />
  );
  const view = render(element(state));
  const user = userEvent.setup();
  return {
    actions,
    user,
    rerender: (next: AppState) => view.rerender(element(next)),
    open: () => user.click(within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getByRole('button', { name: 'Zähler & Abstimmungen' }))
  };
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const list = () => screen.getByRole('list', { name: 'Elemente im Profil' });
/** The button that selects an element; the order buttons of the same item carry its name as well. */
const selectButton = (name: string) =>
  within(list())
    .getAllByRole('button')
    .find((candidate) => candidate.hasAttribute('aria-pressed') && candidate.textContent?.startsWith(name)) as HTMLButtonElement;
const savedNames = (actions: ReturnType<typeof createActions>) =>
  actions.saveCounters.mock.calls.at(-1)?.[0].map((counter: CounterDefinition) => counter.name);

async function rename(user: User, value: string) {
  const name = screen.getByLabelText('Name');
  await user.clear(name);
  await user.type(name, value);
}

describe('Zähler & Abstimmungen', () => {
  it('shows every element with type, triggers, live and overlay status', async () => {
    const { open } = renderCounters(createAppState({ license: LICENSES.pro, settings: createSettings([createRedFlagCounter(100), teamPoll()]) }));
    await open();

    const items = within(list()).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[1]?.textContent).toContain('Abstimmung · 2 Optionen · 2 Auslöser · ohne Ziel');
    expect(items[1]?.textContent).toContain('Läuft');
    expect(items[1]?.textContent).toContain('Eigenes Overlay');
    expect(screen.queryByRole('note', { name: 'Mehr mit Audience Live Pro' })).toBeNull();
  });

  it('saves edits explicitly and confirms them once the backend applied them', async () => {
    const state = createAppState();
    const { actions, user, open, rerender } = renderCounters(state);
    await open();

    await rename(user, 'Flaggen-Runde');
    expect(within(list()).getByText('Ungespeichert')).toBeTruthy();
    expect(button('Neues Element').disabled).toBe(true);
    await user.click(button('Änderungen speichern'));
    expect(savedNames(actions)).toEqual(['Flaggen-Runde']);

    const counter = { ...createRedFlagCounter(10), name: 'Flaggen-Runde' };
    act(() => rerender(createAppState({ settings: createSettings([counter]) })));
    expect(screen.getByRole('region', { name: 'Benachrichtigungen' }).textContent).toContain('Änderungen gespeichert');
    expect(screen.queryByRole('region', { name: 'Ungespeicherte Änderungen' })).toBeNull();
  });

  it('duplicates, sorts and deletes elements before saving them on Pro', async () => {
    const { actions, user, open } = renderCounters(
      createAppState({ license: LICENSES.pro, settings: createSettings([createRedFlagCounter(100), teamPoll()]) })
    );
    await open();

    await user.click(selectButton('Team-Wahl'));
    await user.click(button('Duplizieren'));
    await user.click(button('Team-Wahl (Kopie) nach oben verschieben'));
    await user.click(selectButton('Rote Flaggen'));
    await user.click(button('Rote Flaggen löschen'));
    await user.click(screen.getByRole('button', { name: 'Ja, löschen' }));
    await user.click(button('Änderungen speichern'));

    expect(savedNames(actions)).toEqual(['Team-Wahl (Kopie)', 'Team-Wahl']);
  });

  it('asks before leaving the page with unsaved changes', async () => {
    const { user, open } = renderCounters(createAppState());
    await open();
    await rename(user, 'Neuer Name');

    const navigation = screen.getByRole('navigation', { name: 'Hauptnavigation' });
    await user.click(within(navigation).getByRole('button', { name: 'Cockpit' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Ungespeicherte Änderungen' })).getByRole('button', { name: 'Weiter bearbeiten' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Zähler & Abstimmungen');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Neuer Name');

    await user.click(within(navigation).getByRole('button', { name: 'Cockpit' }));
    await user.click(screen.getByRole('button', { name: 'Verwerfen und verlassen' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Cockpit');
  });

  it('creates a poll from the cockpit shortcut and shows where it appears', async () => {
    const state = createAppState({ license: LICENSES.pro });
    const { actions, user, rerender } = renderCounters(state);

    await user.click(screen.getByRole('button', { name: 'Neues Element' }));
    const dialog = screen.getByRole('dialog', { name: 'Neues Element' });
    for (let step = 0; step < 5; step++) await user.click(within(dialog).getByRole('button', { name: 'Weiter' }));
    await user.click(within(dialog).getByRole('button', { name: 'Erstellen' }));

    const [counters] = actions.saveCounters.mock.calls.at(-1) as [CounterDefinition[]];
    expect(counters.map((counter) => counter.mode)).toEqual(['single', 'poll']);

    act(() => rerender(createAppState({ license: LICENSES.pro, settings: createSettings(counters) })));
    expect(screen.queryByRole('dialog', { name: 'Neues Element' })).toBeNull();
    const created = screen.getByRole('note', { name: 'Element erstellt und gespeichert' });
    await user.click(within(created).getByRole('button', { name: 'Cockpit öffnen' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Cockpit');
  });

  it('explains paused Pro elements after a downgrade without deleting them', async () => {
    const { user, open } = renderCounters(
      createAppState({ license: LICENSES.expired, settings: createSettings([createRedFlagCounter(100), teamPoll()]) })
    );
    await open();

    expect(screen.getByRole('note', { name: 'Mehr mit Audience Live Pro' })).toBeTruthy();
    const items = within(list()).getAllByRole('listitem');
    expect(items[1]?.textContent).toContain('Pausiert');
    expect(items[1]?.textContent).toContain('Overlay mit Pro');

    await user.click(selectButton('Team-Wahl'));
    const hint = screen.getByRole('note', { name: 'Dieses Element braucht Audience Live Pro' });
    expect(hint.textContent).toContain('Abstimmungen mit bis zu sechs Optionen gibt es mit Audience Live Pro.');
  });
});
