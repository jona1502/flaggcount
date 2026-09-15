// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../../shared/appState';
import { createRedFlagCounter } from '../../shared/profiles';
import { DEFAULT_OVERLAY_SETTINGS } from '../../shared/settings';
import { Dashboard } from '../dashboard/Dashboard';
import { LICENSES, OVERLAY_URL, PUBLIC_OVERLAY_URL, createActions, createAppState, createSettings, teamPoll } from '../test/appStateFixtures';

afterEach(cleanup);

type Options = { desktop?: boolean; onCopyText?: (text: string) => Promise<void> };

function renderOverlays(state: AppState, { desktop = true, onCopyText = vi.fn(async (_text: string) => undefined) }: Options = {}) {
  const actions = createActions();
  render(
    <Dashboard
      state={state}
      error={null}
      pending={false}
      actions={actions}
      onDismissError={() => undefined}
      onCopyText={onCopyText}
      proAvailable={desktop}
    />
  );
  const user = userEvent.setup();
  const openPage = (name: string) =>
    user.click(within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getByRole('button', { name }));
  return { actions, user, onCopyText, openPage };
}

const proState = () =>
  createAppState({
    license: LICENSES.pro,
    settings: createSettings([createRedFlagCounter(100), teamPoll()]),
    publicOverlayUrl: PUBLIC_OVERLAY_URL,
    counterOverlayUrls: { teams: 'https://overlay.example.test/c/teams', all: 'https://overlay.example.test/c/all' }
  });

const gallery = () => screen.getByRole('main');
const editorTitle = () => document.getElementById('overlay-editor-title')?.textContent;
const urlOf = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;

describe('Overlays', () => {
  it('leads scenes to the live view', async () => {
    const { user, openPage } = renderOverlays(proState());
    await openPage('Overlays');

    await user.click(screen.getByRole('button', { name: 'Live-Ansicht öffnen' }));

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Live-Ansicht');
  });

  it('offers an overlay for every element and the combined view with matching URLs', async () => {
    const { user, openPage } = renderOverlays(proState());
    await openPage('Overlays');

    expect(within(gallery()).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Rote Flaggen',
      'Team-Wahl',
      'Gesamtansicht'
    ]);
    expect(editorTitle()).toBe('Rote Flaggen');
    expect(urlOf('Lokale URL')).toBe(OVERLAY_URL);
    expect(urlOf('Online-URL')).toBe(PUBLIC_OVERLAY_URL);

    await user.click(screen.getByRole('button', { name: 'Team-Wahl bearbeiten' }));
    expect(editorTitle()).toBe('Team-Wahl');
    expect(screen.getByText('Abstimmung', { selector: '.overlay-editor-type' })).toBeTruthy();
    expect(urlOf('Lokale URL')).toBe(`${OVERLAY_URL}/counter/teams`);
    expect(urlOf('Online-URL')).toBe('https://overlay.example.test/c/teams');
    expect(screen.getByTitle('Vorschau des Overlays').getAttribute('src')).toBe(`${OVERLAY_URL}/counter/teams`);

    await user.click(screen.getByRole('button', { name: 'Gesamtansicht ansehen' }));
    expect(urlOf('Lokale URL')).toBe(`${OVERLAY_URL}/all`);
  });

  it('saves the design of the selected element without touching the others', async () => {
    const { actions, user, openPage } = renderOverlays(proState());
    await openPage('Overlays');

    await user.click(screen.getByRole('button', { name: 'Team-Wahl bearbeiten' }));
    await user.selectOptions(screen.getByLabelText('Position'), 'top');

    expect(actions.setCounterOverlaySettings).toHaveBeenCalledTimes(1);
    expect(actions.setCounterOverlaySettings).toHaveBeenCalledWith('teams', { ...DEFAULT_OVERLAY_SETTINGS, position: 'top' });
    expect(actions.setOverlaySettings).not.toHaveBeenCalled();
  });

  it('shows the combined view without pretending it has a design of its own', async () => {
    const { user, openPage } = renderOverlays(proState());
    await openPage('Overlays');

    await user.click(screen.getByRole('button', { name: 'Gesamtansicht ansehen' }));

    expect(screen.queryByLabelText('Position')).toBeNull();
    expect(screen.getByRole('note', { name: 'Alle Elemente in einem Overlay' })).toBeTruthy();
    expect(screen.getByTitle('Vorschau der Gesamtansicht').getAttribute('src')).toBe(`${OVERLAY_URL}/all`);
  });

  it('copies a URL with feedback and explains how to copy manually if the clipboard fails', async () => {
    const { user, onCopyText, openPage } = renderOverlays(proState());
    await openPage('Overlays');

    await user.click(screen.getByRole('button', { name: 'Lokale URL kopieren' }));
    expect(onCopyText).toHaveBeenCalledWith(OVERLAY_URL);
    expect(screen.getByRole('button', { name: 'Lokale URL kopieren' }).textContent).toBe('Kopiert');
    expect(screen.getByRole('region', { name: 'Benachrichtigungen' }).textContent).toContain('URL kopiert');

    cleanup();
    const failing = renderOverlays(proState(), { onCopyText: async () => Promise.reject(new Error('denied')) });
    await failing.openPage('Overlays');
    await failing.user.click(screen.getByRole('button', { name: 'Online-URL kopieren' }));
    expect(screen.getByText('Die URL konnte nicht kopiert werden. Bitte markiere sie und kopiere sie manuell.')).toBeTruthy();
    expect(screen.getByLabelText('Online-URL').getAttribute('aria-invalid')).toBe('true');
  });

  it('explains that showing elements together needs a second element', async () => {
    const { user, openPage } = renderOverlays(createAppState({ license: LICENSES.pro }));
    await openPage('Overlays');

    const hint = screen.getByRole('note', { name: 'Für die gemeinsame Anzeige fehlt ein zweites Element' });
    await user.click(within(hint).getByRole('button', { name: 'Neues Element' }));

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Zähler & Abstimmungen');
    expect(screen.getByRole('dialog', { name: 'Neues Element' })).toBeTruthy();

    cleanup();
    const withTwo = renderOverlays(proState());
    await withTwo.openPage('Overlays');
    expect(screen.queryByRole('note', { name: 'Für die gemeinsame Anzeige fehlt ein zweites Element' })).toBeNull();
  });

  it('keeps further overlays visible but locked on Free', async () => {
    const state = createAppState({ license: LICENSES.free, settings: createSettings([createRedFlagCounter(100), teamPoll()]) });
    const { user, openPage } = renderOverlays({ ...state, counters: [state.counters[0]!] });
    await openPage('Overlays');

    expect(screen.getByRole('note', { name: 'Ein Overlay pro Element mit Pro' })).toBeTruthy();
    const cards = within(gallery()).getAllByRole('listitem');
    expect(cards[1]?.textContent).toContain('Pausiert');
    expect(cards[2]?.textContent).toContain('Pro erforderlich');

    await user.click(screen.getByRole('button', { name: 'Gesamtansicht ansehen' }));
    expect(screen.getAllByText('Dieses Overlay gehört zu Audience Live Pro.')).toHaveLength(2);
  });

  it('explains the setup in OBS and TikTok LIVE Studio with a recommended size', async () => {
    const { user, openPage } = renderOverlays(createAppState());
    await openPage('Overlays');

    await user.click(screen.getByRole('tab', { name: 'Einrichtung' }));
    const obs = screen.getByRole('tabpanel', { name: 'OBS Studio' });
    expect(obs.textContent).toContain('Breite 520 und Höhe 200');

    await user.click(screen.getByRole('tab', { name: 'TikTok LIVE Studio' }));
    expect(screen.getByRole('tabpanel', { name: 'TikTok LIVE Studio' }).textContent).toContain('Online-URL');
    expect(screen.getByRole('note', { name: 'Die Online-URL ist gerade nicht verfügbar' })).toBeTruthy();
  });

  it('opens the overlay of an element straight from its settings', async () => {
    const { user, openPage } = renderOverlays(proState());
    await openPage('Zähler & Abstimmungen');

    const teams = within(screen.getByRole('list', { name: 'Elemente im Profil' }))
      .getAllByRole('button')
      .find((candidate) => candidate.hasAttribute('aria-pressed') && candidate.textContent?.startsWith('Team-Wahl'));
    await user.click(teams!);
    await user.click(screen.getByRole('button', { name: 'Overlay öffnen' }));

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Overlays');
    expect(editorTitle()).toBe('Team-Wahl');
  });

  it('designs the first overlay in the browser dashboard', async () => {
    const { actions, user, onCopyText, openPage } = renderOverlays(createAppState(), { desktop: false });
    await openPage('Overlays');

    await user.click(screen.getByRole('checkbox', { name: 'Hintergrund anzeigen' }));
    await user.click(screen.getByRole('button', { name: 'Lokale URL kopieren' }));

    expect(actions.setOverlaySettings).toHaveBeenCalledWith({ ...DEFAULT_OVERLAY_SETTINGS, showBackground: false });
    expect(actions.setCounterOverlaySettings).not.toHaveBeenCalled();
    expect(onCopyText).toHaveBeenCalledWith(OVERLAY_URL);
  });
});
