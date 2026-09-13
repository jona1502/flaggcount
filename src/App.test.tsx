// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emit } from '@tauri-apps/api/event';
import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppState } from '../shared/appState';
import { App } from './App';
import { ERROR_MESSAGES } from './dashboard/errorMessages';

const OVERLAY_URL = 'http://127.0.0.1:3847/overlay';

const backendState: AppState = {
  sidecarRunning: true,
  connection: { status: 'disconnected', username: null },
  votes: { count: 0, target: 10, roundId: 'round-1', targetReached: false },
  overlayUrl: OVERLAY_URL,
  settings: { username: '', target: 10, overlay: { showBackground: true, showProgress: true } }
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

async function renderApp() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText('von 10 Stimmen');
  return user;
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
    expect(screen.getByText('Version 0.1.0')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Nicht verbunden');
  });

  it('sends every dashboard action as the matching Tauri command', async () => {
    const user = await renderApp();

    await user.type(screen.getByLabelText('TikTok-Benutzername'), 'streamer');
    await user.click(screen.getByRole('button', { name: 'Verbinden' }));

    const target = screen.getByLabelText('Stimmenziel');
    await user.clear(target);
    await user.type(target, '25');
    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));

    await user.click(screen.getByRole('button', { name: 'Runde zurücksetzen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, zurücksetzen' }));

    await user.click(screen.getByRole('checkbox', { name: 'Hintergrund anzeigen' }));
    await user.click(screen.getByRole('button', { name: 'URL kopieren' }));

    expect(payloadOf('connect')).toEqual({ username: 'streamer' });
    expect(payloadOf('set_target')).toEqual({ target: 25 });
    expect(commands()).toContain('reset_votes');
    expect(payloadOf('set_overlay_settings')).toEqual({ overlay: { showBackground: false, showProgress: true } });
    expect(payloadOf('plugin:clipboard-manager|write_text')).toMatchObject({ text: OVERLAY_URL });
  });

  it('updates the dashboard as soon as the backend emits a new state', async () => {
    await renderApp();

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
