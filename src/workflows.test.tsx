// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emit } from '@tauri-apps/api/event';
import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppState } from '../shared/appState';
import { createRedFlagCounter, type CounterDefinition } from '../shared/profiles';
import { DEFAULT_OVERLAY_SETTINGS } from '../shared/settings';
import { App } from './App';
import { LICENSES, OVERLAY_URL, createAppState, createProfile, createSettings, historyRound, snapshotOf, teamPoll } from './test/appStateFixtures';

/**
 * End-to-end flows of the redesigned desktop app against Tauri's IPC mocks. The backend state only
 * changes when a test publishes it, exactly like the Rust side emits `state-changed` after a command.
 */

type User = ReturnType<typeof userEvent.setup>;
type Call = { cmd: string; payload: Record<string, unknown> | undefined };

const EXPORT_PATH = 'C:\\Users\\streamer\\Downloads\\flagcount-history.csv';
let calls: Call[];
let backend: AppState;

beforeEach(() => {
  calls = [];
  backend = createAppState();
  mockWindows('main');
  mockIPC(
    (cmd, payload) => {
      calls.push({ cmd, payload: payload as Record<string, unknown> | undefined });
      switch (cmd) {
        case 'get_state':
          return backend;
        case 'plugin:app|version':
          return '0.4.0';
        case 'export_history_csv':
          return EXPORT_PATH;
        default:
          return null;
      }
    },
    { shouldMockEvents: true }
  );
});

afterEach(() => {
  cleanup();
  clearMocks();
});

const commands = (): string[] => calls.map((call) => call.cmd);
const lastPayload = (cmd: string) => calls.filter((call) => call.cmd === cmd).at(-1)?.payload;

async function publish(next: AppState): Promise<void> {
  backend = next;
  await act(() => emit('state-changed', next));
}

async function start(): Promise<User> {
  const user = userEvent.setup();
  render(<App autoCheckUpdates={false} />);
  await screen.findByRole('heading', { level: 1, name: 'Übersicht' });
  return user;
}

const openPage = (user: User, name: string) =>
  user.click(within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getByRole('button', { name }));

describe('Redesigned workflows', () => {
  it('runs a Free stream: connect, count, copy the overlay and see polls explained as Pro', async () => {
    const user = await start();

    await user.type(screen.getByLabelText('TikTok-Benutzername'), 'streamer');
    await user.click(screen.getByRole('button', { name: 'Verbinden' }));
    expect(lastPayload('connect')).toEqual({ username: 'streamer' });
    await publish({ ...backend, connection: { status: 'connected', username: 'streamer' } });
    expect(screen.getByRole('status').textContent).toBe('Verbunden mit @streamer');

    await openPage(user, 'Übersicht');
    await user.click(screen.getByRole('button', { name: 'Flagge hinzufügen' }));
    expect(lastPayload('add_manual_vote')).toEqual({ counterId: 'red-flags', optionId: 'red-flag' });
    await publish({ ...backend, counters: [snapshotOf(backend.settings.profiles[0]!.counters[0]!, [1])] });
    expect(screen.getByTestId('vote-count').textContent).toBe('1');

    await openPage(user, 'Overlays');
    await user.click(screen.getByRole('button', { name: 'Lokale URL kopieren' }));
    expect(lastPayload('plugin:clipboard-manager|write_text')).toMatchObject({ text: OVERLAY_URL });

    await openPage(user, 'Zähler & Abstimmungen');
    await user.click(screen.getByRole('button', { name: 'Neues Element' }));
    const wizard = screen.getByRole('dialog', { name: 'Neues Element' });
    expect((within(wizard).getByRole('radio', { name: 'Abstimmung' }) as HTMLInputElement).disabled).toBe(true);
    expect(within(wizard).getByText('Pro erforderlich')).toBeTruthy();
  });

  it('activates Pro, creates a poll, controls it live and designs its own overlay', async () => {
    const user = await start();

    await openPage(user, 'Pro & Lizenz');
    await user.type(screen.getByLabelText('Aktivierungscode'), 'FC-TEST-CODE');
    await user.click(screen.getByRole('button', { name: 'Aktivieren' }));
    expect(lastPayload('activate_license')).toEqual({ code: 'FC-TEST-CODE', replaceInstallationId: null });

    await publish({ ...backend, license: LICENSES.pro });
    await user.click(within(screen.getByRole('note', { name: 'Pro ist freigeschaltet' })).getByRole('button', { name: 'Abstimmung erstellen' }));
    const wizard = screen.getByRole('dialog', { name: 'Neues Element' });
    for (let step = 0; step < 5; step++) await user.click(within(wizard).getByRole('button', { name: 'Weiter' }));
    await user.click(within(wizard).getByRole('button', { name: 'Erstellen' }));

    const { counters } = lastPayload('save_counters') as { counters: CounterDefinition[] };
    expect(counters.map((counter) => counter.mode)).toEqual(['single', 'poll']);
    const poll = counters[1]!;
    await publish({
      ...backend,
      settings: createSettings(counters),
      counters: [snapshotOf(counters[0]!), snapshotOf(poll)],
      counterOverlayUrls: { [poll.id]: 'https://overlay.example.test/c/poll' }
    });

    await user.click(within(screen.getByRole('note', { name: 'Element erstellt und gespeichert' })).getByRole('button', { name: 'Übersicht öffnen' }));
    const card = screen.getAllByRole('article').find((article) => within(article).queryByRole('heading', { name: poll.name }));
    await user.click(within(card!).getByRole('button', { name: 'Stimme für B hinzufügen' }));
    expect(lastPayload('add_manual_vote')).toEqual({ counterId: poll.id, optionId: poll.options[1]!.id });

    await openPage(user, 'Overlays');
    await user.click(screen.getByRole('button', { name: `${poll.name} bearbeiten` }));
    expect((screen.getByLabelText('Lokale URL') as HTMLInputElement).value).toBe(`${OVERLAY_URL}/counter/${poll.id}`);
    expect((screen.getByLabelText('Online-URL') as HTMLInputElement).value).toBe('https://overlay.example.test/c/poll');
    await user.selectOptions(screen.getByLabelText('Position'), 'top');
    expect(lastPayload('set_counter_overlay_settings')).toEqual({ counterId: poll.id, overlay: { ...DEFAULT_OVERLAY_SETTINGS, position: 'top' } });
  });

  it('keeps Pro elements and designs after a downgrade while the Free counter keeps running', async () => {
    const flags = createRedFlagCounter(10);
    const poll: CounterDefinition = { ...teamPoll(), overlay: { ...DEFAULT_OVERLAY_SETTINGS, theme: 'neon' } };
    backend = createAppState({ license: LICENSES.pro, settings: createSettings([flags, poll]) });
    const user = await start();

    await publish({ ...backend, license: LICENSES.expired, counters: [snapshotOf(flags)] });
    await openPage(user, 'Übersicht');
    expect(screen.getByRole('note', { name: '1 Element läuft gerade nicht' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Flagge hinzufügen' }) as HTMLButtonElement).disabled).toBe(false);

    await openPage(user, 'Zähler & Abstimmungen');
    const items = within(screen.getByRole('list', { name: 'Elemente im Profil' })).getAllByRole('listitem');
    expect(items[1]?.textContent).toContain('Pausiert');
    expect(commands()).not.toContain('save_counters');
    expect(commands()).not.toContain('delete_profile');
  });

  it('manages stream profiles on Pro and switches only after a confirmation', async () => {
    backend = createAppState({ license: LICENSES.pro });
    const user = await start();

    await openPage(user, 'Profile');
    await user.click(screen.getByRole('button', { name: 'Neues Profil' }));
    await user.type(within(screen.getByRole('dialog', { name: 'Neues Profil' })).getByLabelText('Neues Profil'), 'A/B Test{Enter}');
    expect(lastPayload('create_profile')).toEqual({ name: 'A/B Test' });

    await publish({ ...backend, settings: createSettings(undefined, [createProfile('ab-test', 'A/B Test', [teamPoll()])]) });
    await user.click(screen.getByRole('button', { name: 'Zu A/B Test wechseln' }));
    expect(commands()).not.toContain('switch_profile');
    await user.click(screen.getByRole('button', { name: 'Ja, wechseln' }));
    expect(lastPayload('switch_profile')).toEqual({ profileId: 'ab-test' });
  });

  it('exports the round history with aggregated results only', async () => {
    backend = createAppState({ license: LICENSES.pro, history: [historyRound()] });
    const user = await start();

    await openPage(user, 'Historie');
    await user.click(screen.getByRole('button', { name: 'CSV exportieren' }));

    const { csv } = lastPayload('export_history_csv') as { csv: string };
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Rote Flaggen');
    expect(csv).not.toMatch(/userId|nickname|uniqueId/i);
    expect(await screen.findByText(`Gespeichert unter ${EXPORT_PATH}`)).toBeTruthy();
  });
});
