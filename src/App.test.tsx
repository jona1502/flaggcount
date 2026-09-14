// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emit } from '@tauri-apps/api/event';
import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FREE_LICENSE_STATE } from '../shared/licensing';
import { migrateSettingsV1 } from '../shared/profiles';
import { DEFAULT_OVERLAY_SETTINGS } from '../shared/settings';
import type { AppState } from '../shared/appState';
import { App } from './App';
import { ERROR_MESSAGES } from './dashboard/errorMessages';

const OVERLAY_URL = 'http://127.0.0.1:3847/overlay';

const backendState: AppState = {
  sidecarRunning: true,
  connection: { status: 'disconnected', username: null },
  votes: { count: 0, target: 10, roundId: 'round-1', targetReached: false },
  overlayUrl: OVERLAY_URL,
  counters: [],
  license: FREE_LICENSE_STATE,
  publicOverlayUrl: null,
  settings: migrateSettingsV1({ username: '', target: 10, overlay: { ...DEFAULT_OVERLAY_SETTINGS, showBackground: true, showProgress: true } }, '2026-01-01T00:00:00.000Z')
};

type Call = { cmd: string; payload: Record<string, unknown> | undefined };

let calls: Call[];
let failures: Record<string, unknown>;

/** Replaces the Rust backend with Tauri's official IPC and event mocks. */
function mockBackend(): void {
  mockWindows('main');
  mockIPC(
    (cmd, payload) => {
      calls.push({ cmd, payload: payload as Record<string, unknown> | undefined });
      if (cmd in failures) return Promise.reject(failures[cmd]);
      switch (cmd) {
        case 'get_state':
          return backendState;
        case 'plugin:app|version':
          return '0.1.0';
        default:
          return null;
      }
    },
    { shouldMockEvents: true }
  );
}

const commands = (): string[] => calls.map((call) => call.cmd);
const payloadOf = (cmd: string) => calls.find((call) => call.cmd === cmd)?.payload;

type User = ReturnType<typeof userEvent.setup>;

async function renderApp(): Promise<User> {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('heading', { level: 1, name: 'Übersicht' });
  return user;
}

async function openPage(user: User, name: string): Promise<void> {
  await user.click(within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getByRole('button', { name }));
}

beforeEach(() => {
  calls = [];
  failures = {};
  mockBackend();
});

afterEach(() => {
  cleanup();
  clearMocks();
});

describe('App with the Tauri backend', () => {
  it('loads the backend state and version on start', async () => {
    await renderApp();

    expect(commands()).toContain('get_state');
    expect(await screen.findByText('Version 0.1.0')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('checks for updates on demand in the settings', async () => {
    const user = await renderApp();

    await openPage(user, 'Einstellungen');
    await user.click(screen.getByRole('button', { name: 'Nach Updates suchen' }));

    expect(commands()).toContain('plugin:updater|check');
    expect(await screen.findByText('FlagCount ist aktuell.')).toBeTruthy();
  });

  it('sends every dashboard action as the matching Tauri command', async () => {
    const user = await renderApp();

    await user.type(screen.getByLabelText('TikTok-Benutzername'), 'streamer');
    await user.click(screen.getByRole('button', { name: 'Verbinden' }));

    await openPage(user, 'Live-Steuerung');
    await user.click(screen.getByRole('button', { name: 'Flagge hinzufügen' }));
    await act(() =>
      emit('state-changed', {
        ...backendState,
        votes: { ...backendState.votes, count: 1 }
      } satisfies AppState)
    );
    await user.click(screen.getByRole('button', { name: 'Flagge abziehen' }));

    const target = screen.getByLabelText('Stimmenziel');
    await user.clear(target);
    await user.type(target, '25');
    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));

    await user.click(screen.getByRole('button', { name: 'Runde zurücksetzen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, zurücksetzen' }));

    await openPage(user, 'Overlays');
    await user.click(screen.getByRole('checkbox', { name: 'Hintergrund anzeigen' }));
    await user.click(screen.getByRole('button', { name: 'Lokale URL kopieren' }));

    expect(payloadOf('connect')).toEqual({ username: 'streamer' });
    expect(commands()).toContain('add_manual_vote');
    expect(commands()).toContain('remove_manual_vote');
    expect(payloadOf('set_target')).toEqual({ target: 25 });
    expect(commands()).toContain('reset_votes');
    expect(payloadOf('set_counter_overlay_settings')).toEqual({
      counterId: 'red-flags',
      overlay: { ...DEFAULT_OVERLAY_SETTINGS, showBackground: false, showProgress: true }
    });
    expect(payloadOf('plugin:clipboard-manager|write_text')).toMatchObject({ text: OVERLAY_URL });
  });

  it('updates the dashboard as soon as the backend emits a new state', async () => {
    const user = await renderApp();
    await openPage(user, 'Live-Steuerung');

    await act(() =>
      emit('state-changed', {
        ...backendState,
        connection: { status: 'connected', username: 'streamer' },
        votes: { count: 7, target: 10, roundId: 'round-1', targetReached: false }
      } satisfies AppState)
    );

    expect(screen.getByTestId('vote-count').textContent).toBe('7');
    expect(screen.getByRole('status').textContent).toBe('Verbunden mit @streamer');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('7');
  });

  it('shows errors reported by the backend in German', async () => {
    await renderApp();

    await act(() => emit('app-error', { code: 'user-offline', message: "The requested user isn't online :(" }));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(ERROR_MESSAGES['user-offline']);
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Fehlermeldung schließen' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a German message when a command is rejected', async () => {
    failures['connect'] = { code: 'sidecar-unavailable', message: 'The TikTok connection service is not running' };
    const user = await renderApp();

    await user.type(screen.getByLabelText('TikTok-Benutzername'), 'streamer');
    await user.click(screen.getByRole('button', { name: 'Verbinden' }));

    expect((await screen.findByRole('alert')).textContent).toContain(ERROR_MESSAGES['sidecar-unavailable']);
  });
});

describe('FlagCount Pro in the Tauri app', () => {
  it('activates a license and opens the Pro page from the license area', async () => {
    const user = await renderApp();

    await openPage(user, 'Lizenz & Konto');
    await user.type(screen.getByLabelText('Aktivierungscode'), ' FC-7K2QM-9XH4D-PZ1RT-W8C3N ');
    await user.click(screen.getByRole('button', { name: 'Aktivieren' }));
    await user.click(screen.getByRole('button', { name: 'Preise & Pro ansehen' }));

    expect(payloadOf('activate_license')).toEqual({ code: 'FC-7K2QM-9XH4D-PZ1RT-W8C3N', replaceInstallationId: null });
    expect(commands()).toContain('open_pro_page');
  });
});

describe('Stream profiles in the Tauri app', () => {
  it('renames the profile from the profile area', async () => {
    const user = await renderApp();

    await openPage(user, 'Profile');
    await user.click(screen.getByRole('button', { name: 'Standard umbenennen' }));
    const input = screen.getByLabelText('Neuer Name für Standard');
    await user.clear(input);
    await user.type(input, 'Hauptprofil');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(payloadOf('rename_profile')).toEqual({ profileId: 'default', name: 'Hauptprofil' });
  });
});

describe('Counters in the Tauri app', () => {
  it('saves the renamed counter of the running profile', async () => {
    const user = await renderApp();

    await openPage(user, 'Zähler & Abstimmungen');
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Flaggen-Runde');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    const saved = payloadOf('save_counters') as { counters: { name: string }[] } | undefined;
    expect(saved?.counters.map((counter) => counter.name)).toEqual(['Flaggen-Runde']);
  });
});

describe('Parallel counters in the Tauri app', () => {
  it('corrects a poll option and resets one counter from the live board', async () => {
    const user = await renderApp();
    await openPage(user, 'Live-Steuerung');

    await act(() =>
      emit('state-changed', {
        ...backendState,
        counters: [
          {
            counterId: 'red-flags',
            name: 'Rote Flaggen',
            mode: 'single',
            options: [{ optionId: 'red-flag', label: 'Rote Flagge', count: 2 }],
            totalCount: 2,
            target: 10,
            targetReached: false,
            roundId: 'r1'
          },
          {
            counterId: 'teams',
            name: 'Team-Wahl',
            mode: 'poll',
            options: [
              { optionId: 'red', label: 'Rot', count: 1 },
              { optionId: 'blue', label: 'Blau', count: 0 }
            ],
            totalCount: 1,
            target: null,
            targetReached: false,
            roundId: 'r2'
          }
        ]
      } satisfies AppState)
    );

    await user.click(screen.getByRole('button', { name: 'Stimme für Blau hinzufügen' }));
    await user.click(screen.getByRole('button', { name: 'Team-Wahl zurücksetzen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, zurücksetzen' }));

    expect(payloadOf('add_manual_vote')).toEqual({ counterId: 'teams', optionId: 'blue' });
    expect(payloadOf('reset_votes')).toEqual({ counterId: 'teams' });
  });
});
