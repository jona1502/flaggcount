// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppState } from '../../shared/appState';
import { createRedFlagCounter, type Settings } from '../../shared/profiles';
import { Dashboard } from '../dashboard/Dashboard';
import { LICENSES, createActions, createAppState, createProfile, createSettings, teamPoll } from '../test/appStateFixtures';

afterEach(cleanup);

function settingsWith(names: string[]): Settings {
  const [first, ...rest] = names;
  return {
    ...createSettings(undefined, rest.map((name, index) => createProfile(`p${index + 1}`, name, [createRedFlagCounter(10), teamPoll()]))),
    profiles: [
      { ...createSettings().profiles[0]!, name: first ?? 'Standard' },
      ...rest.map((name, index) => createProfile(`p${index + 1}`, name, [createRedFlagCounter(10), teamPoll()]))
    ]
  };
}

async function renderProfiles(state: AppState) {
  const actions = createActions();
  const element = (next: AppState) => (
    <Dashboard state={next} error={null} pending={false} actions={actions} onDismissError={() => undefined} onCopyText={async () => undefined} proAvailable />
  );
  const view = render(element(state));
  const user = userEvent.setup();
  await user.click(within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getByRole('button', { name: 'Profile' }));
  return { actions, user, rerender: (next: AppState) => act(() => view.rerender(element(next))) };
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const toasts = () => screen.getByRole('region', { name: 'Benachrichtigungen' }).textContent;

describe('Profile', () => {
  it('shows the Free limit and explains what Pro adds instead of failing later', async () => {
    const { user } = await renderProfiles(createAppState());

    expect(screen.getByText('1 von 1 Profil')).toBeTruthy();
    expect(button('Neues Profil').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Standard duplizieren' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Standard löschen' })).toBeNull();

    await user.click(within(screen.getByRole('note', { name: 'Mehrere Profile mit Audience Live Pro' })).getByRole('button', { name: 'Mehr zu Pro' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Lizenz & Konto');
  });

  it('creates a profile with a trimmed name and confirms it once it exists', async () => {
    const state = createAppState({ license: LICENSES.pro });
    const { actions, user, rerender } = await renderProfiles(state);

    expect(screen.getByText('1 von 10 Profilen')).toBeTruthy();
    await user.click(button('Neues Profil'));
    const dialog = screen.getByRole('dialog', { name: 'Neues Profil' });
    await user.click(within(dialog).getByRole('button', { name: 'Anlegen' }));
    expect(within(dialog).getByText('Bitte gib dem Profil einen Namen.')).toBeTruthy();

    await user.type(within(dialog).getByLabelText('Neues Profil'), '  Quiz-Abend {Enter}');
    expect(actions.createProfile).toHaveBeenCalledWith('Quiz-Abend');

    rerender(createAppState({ license: LICENSES.pro, settings: settingsWith(['Standard', 'Quiz-Abend']) }));
    expect(screen.queryByRole('dialog', { name: 'Neues Profil' })).toBeNull();
    expect(toasts()).toContain('Profil „Quiz-Abend“ angelegt');
  });

  it('asks before switching, because running rounds end', async () => {
    const { actions, user } = await renderProfiles(createAppState({ license: LICENSES.pro, settings: settingsWith(['Standard', 'Quiz']) }));

    const cards = within(screen.getByRole('list', { name: 'Gespeicherte Profile' })).getAllByRole('listitem');
    expect(cards[0]?.textContent).toContain('Läuft');
    await user.click(button('Zu Quiz wechseln'));
    const dialog = screen.getByRole('dialog', { name: 'Zu „Quiz“ wechseln?' });
    expect(dialog.textContent).toContain('Laufende Runden werden beim Wechsel beendet.');
    expect(actions.switchProfile).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Ja, wechseln' }));

    expect(actions.switchProfile).toHaveBeenCalledWith('p1');
  });

  it('renames, duplicates and deletes after confirmation', async () => {
    const { actions, user } = await renderProfiles(createAppState({ license: LICENSES.pro, settings: settingsWith(['Standard', 'Quiz']) }));

    await user.click(button('Quiz umbenennen'));
    const input = screen.getByLabelText('Neuer Name für Quiz');
    await user.clear(input);
    await user.click(button('Speichern'));
    expect(screen.getByText('Bitte gib dem Profil einen Namen.')).toBeTruthy();
    await user.type(input, 'Quiz 2');
    await user.click(button('Speichern'));
    await user.click(button('Standard duplizieren'));
    await user.click(button('Quiz löschen'));
    await user.click(within(screen.getByRole('dialog', { name: '„Quiz“ löschen?' })).getByRole('button', { name: 'Ja, löschen' }));

    expect(actions.renameProfile).toHaveBeenCalledWith('p1', 'Quiz 2');
    expect(actions.duplicateProfile).toHaveBeenCalledWith('default');
    expect(actions.deleteProfile).toHaveBeenCalledWith('p1');
  });

  it('keeps Pro profiles after a downgrade but marks them inactive', async () => {
    await renderProfiles(createAppState({ license: LICENSES.expired, settings: settingsWith(['Standard', 'Quiz', 'Turnier']) }));

    expect(screen.getByText('3 von 1 Profil')).toBeTruthy();
    expect(screen.getByRole('note', { name: 'Einige Profile sind pausiert' })).toBeTruthy();
    expect(screen.getAllByText('Nutzbar mit Audience Live Pro')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Zu Quiz wechseln' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quiz umbenennen' })).toBeNull();
    expect(button('Quiz löschen')).toBeTruthy();
  });

  it('never offers to delete the last profile', async () => {
    await renderProfiles(createAppState({ license: LICENSES.pro }));

    expect(screen.queryByRole('button', { name: 'Standard löschen' })).toBeNull();
    expect(button('Standard duplizieren')).toBeTruthy();
  });
});
