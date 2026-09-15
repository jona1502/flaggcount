// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../../shared/appState';
import { createRedFlagCounter, type OverlayView, type StreamProfile } from '../../shared/profiles';
import { Dashboard } from '../dashboard/Dashboard';
import { LICENSES, OVERLAY_URL, createActions, createAppState, createSettings, teamPoll } from '../test/appStateFixtures';

afterEach(cleanup);

const NOW = '2026-09-15T00:00:00.000Z';

const scene: OverlayView = {
  id: 'v-main',
  name: 'Hauptszene',
  items: [
    { id: 'i-1', counterId: 'teams', scale: 100 },
    { id: 'i-2', counterId: 'red-flags', scale: 60 }
  ],
  layout: 'horizontal',
  gap: 24,
  horizontalAlign: 'center',
  verticalAlign: 'end',
  scale: 70,
  createdAt: NOW,
  updatedAt: NOW
};

function proState(profile: Partial<Pick<StreamProfile, 'overlayViews' | 'liveSceneId' | 'liveHidden'>> = {}): AppState {
  const settings = createSettings([createRedFlagCounter(50), teamPoll()]);
  return createAppState({
    license: LICENSES.pro,
    settings: { ...settings, profiles: settings.profiles.map((stored) => ({ ...stored, ...profile })) }
  });
}

function renderLiveView(state: AppState) {
  const actions = createActions();
  render(
    <Dashboard
      state={state}
      error={null}
      pending={false}
      actions={actions}
      onDismissError={() => undefined}
      onCopyText={async () => undefined}
      proAvailable
    />
  );
  const user = userEvent.setup();
  const open = () => user.click(within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getByRole('button', { name: 'Live-Ansicht' }));
  return { actions, user, open };
}

const sceneList = () => screen.getByRole('list', { name: 'Szenen' });

describe('Live-Ansicht', () => {
  it('gives one live URL, previews the automatic scene and switches a saved scene live', async () => {
    const { actions, user, open } = renderLiveView(proState({ overlayViews: [scene] }));
    await open();

    expect((screen.getByLabelText('Lokale Live-URL') as HTMLInputElement).value).toBe(`${OVERLAY_URL}/live`);
    expect(screen.getByTitle('Vorschau der Szene').getAttribute('src')).toBe(`${OVERLAY_URL}/preview`);
    expect(within(sceneList()).getAllByRole('listitem').map((item) => item.getAttribute('data-live'))).toEqual(['true', 'false']);

    await user.click(screen.getByRole('button', { name: 'Hauptszene live schalten' }));
    expect(actions.setLiveScene).toHaveBeenCalledWith('v-main');
  });

  it('creates a scene that shows the same element twice', async () => {
    const { actions, user, open } = renderLiveView(proState());
    await open();

    await user.click(screen.getByRole('button', { name: 'Neue Szene' }));
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Doppelt');
    await user.selectOptions(screen.getByLabelText('Element hinzufügen'), 'red-flags');
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await user.click(screen.getByRole('button', { name: 'Unten rechts' }));
    await user.click(screen.getByRole('button', { name: 'Szene erstellen' }));

    expect(actions.createOverlayView).toHaveBeenCalledWith({
      name: 'Doppelt',
      items: [
        { id: 'i-1', counterId: 'red-flags', scale: 100 },
        { id: 'i-2', counterId: 'teams', scale: 100 },
        { id: 'i-3', counterId: 'red-flags', scale: 100 }
      ],
      layout: 'horizontal',
      gap: 24,
      horizontalAlign: 'end',
      verticalAlign: 'end',
      scale: 70
    });
  });

  it('warns before changing the live scene and hides the live overlay', async () => {
    const { actions, user, open } = renderLiveView(proState({ overlayViews: [scene], liveSceneId: 'v-main' }));
    await open();

    expect(screen.getByRole('note', { name: 'Diese Szene ist gerade live' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Overlay ausblenden' }));
    expect(actions.setLiveHidden).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole('button', { name: 'Team-Wahl entfernen' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(actions.updateOverlayView).toHaveBeenCalledWith('v-main', expect.objectContaining({ items: [{ id: 'i-2', counterId: 'red-flags', scale: 60 }] }));
  });

  it('hides an element of a saved scene and changes the order right away', async () => {
    const { actions, user, open } = renderLiveView(proState({ overlayViews: [scene], liveSceneId: 'v-main' }));
    await open();

    await user.click(screen.getByRole('button', { name: 'Rote Flaggen ausblenden' }));
    expect(actions.updateOverlayView).toHaveBeenLastCalledWith(
      'v-main',
      expect.objectContaining({
        items: [
          { id: 'i-1', counterId: 'teams', scale: 100 },
          { id: 'i-2', counterId: 'red-flags', scale: 60, hidden: true }
        ]
      })
    );

    await user.click(screen.getByRole('button', { name: 'Rote Flaggen nach oben' }));
    expect(actions.updateOverlayView).toHaveBeenLastCalledWith(
      'v-main',
      expect.objectContaining({
        items: [
          { id: 'i-2', counterId: 'red-flags', scale: 60 },
          { id: 'i-1', counterId: 'teams', scale: 100 }
        ]
      })
    );
    expect((screen.getByRole('button', { name: 'Speichern' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists every running element of the automatic scene and keeps a change as a live scene', async () => {
    const { actions, user, open } = renderLiveView(proState());
    await open();

    const card = screen.getByRole('region', { name: 'Automatische Szene' });
    expect(within(card).getAllByRole('listitem').map((item) => item.querySelector('.scene-item-name')?.textContent)).toEqual(['Rote Flaggen', 'Team-Wahl']);

    await user.click(within(card).getByRole('button', { name: 'Team-Wahl ausblenden' }));
    expect(actions.createOverlayView).toHaveBeenCalledWith({
      name: 'Alle Elemente',
      items: [
        { id: 'i-1', counterId: 'red-flags', scale: 100 },
        { id: 'i-2', counterId: 'teams', scale: 100, hidden: true }
      ],
      layout: 'vertical',
      gap: 18,
      horizontalAlign: 'center',
      verticalAlign: 'center',
      scale: 92
    });
    await vi.waitFor(() => expect(actions.setLiveScene).toHaveBeenCalledWith('v-test'));
  });

  it('explains scenes as Pro and keeps the Free live URL', async () => {
    const { open } = renderLiveView(createAppState());
    await open();

    expect(screen.getByRole('note', { name: 'Szenen mit Audience Live Pro' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Neue Szene' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(sceneList()).getAllByRole('listitem')).toHaveLength(1);
    expect((screen.getByLabelText('Lokale Live-URL') as HTMLInputElement).value).toBe(`${OVERLAY_URL}/live`);
  });
});
