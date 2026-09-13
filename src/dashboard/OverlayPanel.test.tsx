// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateSettingsV1 } from '../../shared/profiles';
import { DEFAULT_OVERLAY_SETTINGS } from '../../shared/settings';
import type { AppState } from '../../shared/appState';
import type { FlagCountActions } from '../api/useFlagCount';
import { Dashboard } from './Dashboard';
import { OverlayPanel } from './OverlayPanel';

const OVERLAY_URL = 'http://127.0.0.1:3847/overlay';
const PUBLIC_OVERLAY_URL = 'https://overlay.muhrindustries.com/o/abcdefghijklmnopqrstuv';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderPanel(overrides: Partial<ComponentProps<typeof OverlayPanel>> = {}) {
  const props: ComponentProps<typeof OverlayPanel> = {
    overlayUrl: OVERLAY_URL,
    publicOverlayUrl: null,
    settings: { ...DEFAULT_OVERLAY_SETTINGS, showBackground: true, showProgress: true },
    disabled: false,
    onCopy: vi.fn(async (_text: string) => undefined),
    onChangeSettings: vi.fn(),
    ...overrides
  };
  render(<OverlayPanel {...props} />);
  return props;
}

const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

describe('OverlayPanel', () => {
  it('shows the overlay URL', () => {
    renderPanel();

    expect((screen.getByLabelText('Als Browser- oder Link-Quelle hinzufügen') as HTMLInputElement).value).toBe(
      OVERLAY_URL
    );
  });

  it('offers the online URL for TikTok LIVE Studio before the local one', async () => {
    const { onCopy } = renderPanel({ publicOverlayUrl: PUBLIC_OVERLAY_URL });

    const fields = screen.getAllByRole('textbox') as HTMLInputElement[];
    expect(fields.map((field) => field.value)).toEqual([PUBLIC_OVERLAY_URL, OVERLAY_URL]);
    expect(screen.getByLabelText('Online-URL für TikTok LIVE Studio und OBS')).toBe(fields[0]);
    expect(screen.getByLabelText('Lokale URL (nur für OBS auf diesem PC)')).toBe(fields[1]);

    const [copyOnline] = screen.getAllByRole('button', { name: 'URL kopieren' });
    await userEvent.setup().click(copyOnline as HTMLElement);

    expect(onCopy).toHaveBeenCalledWith(PUBLIC_OVERLAY_URL);
    expect(screen.getAllByRole('button', { name: 'Kopiert!' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'URL kopieren' })).toHaveLength(1);
  });

  it('copies the URL and confirms it', async () => {
    const { onCopy } = renderPanel();

    await userEvent.setup().click(screen.getByRole('button', { name: 'URL kopieren' }));

    expect(onCopy).toHaveBeenCalledWith(OVERLAY_URL);
    expect(screen.getByRole('button', { name: 'Kopiert!' })).toBeTruthy();
  });

  it('resets the confirmation after a moment', async () => {
    vi.useFakeTimers();
    renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'URL kopieren' }));
    });
    expect(screen.getByRole('button', { name: 'Kopiert!' })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('button', { name: 'URL kopieren' })).toBeTruthy();
  });

  it('explains how to copy manually if the clipboard fails', async () => {
    renderPanel({
      onCopy: vi.fn(async (_text: string) => {
        throw new Error('denied');
      })
    });

    await userEvent.setup().click(screen.getByRole('button', { name: 'URL kopieren' }));

    expect(screen.getByRole('alert').textContent).toContain('manuell');
  });

  it('shows a hint while no overlay URL is available', () => {
    renderPanel({ overlayUrl: null });

    expect(screen.getByText('Die Overlay-URL ist verfügbar, sobald der Verbindungsdienst läuft.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'URL kopieren' })).toBeNull();
    expect(screen.queryByTitle('Vorschau des Overlays')).toBeNull();
  });

  it('shows the saved display settings', () => {
    renderPanel({ settings: { ...DEFAULT_OVERLAY_SETTINGS, showBackground: false, showProgress: true } });

    expect(checkbox('Hintergrund anzeigen').checked).toBe(false);
    expect(checkbox('Fortschrittsbalken anzeigen').checked).toBe(true);
  });

  it('changes a display setting', async () => {
    const { onChangeSettings } = renderPanel();

    await userEvent.setup().click(checkbox('Fortschrittsbalken anzeigen'));

    expect(onChangeSettings).toHaveBeenCalledWith({ ...DEFAULT_OVERLAY_SETTINGS, showBackground: true, showProgress: false });
  });

  it('disables the display settings while an action is pending', () => {
    renderPanel({ disabled: true });

    expect(checkbox('Hintergrund anzeigen').disabled).toBe(true);
  });

  it('is part of the dashboard', async () => {
    const state: AppState = {
      sidecarRunning: true,
      connection: { status: 'disconnected', username: null },
      votes: { count: 0, target: 10, roundId: 'r1', targetReached: false },
      overlayUrl: OVERLAY_URL,
      publicOverlayUrl: null,
      settings: migrateSettingsV1({ username: '', target: 10, overlay: { ...DEFAULT_OVERLAY_SETTINGS, showBackground: true, showProgress: true } }, '2026-01-01T00:00:00.000Z')
    };
    const actions = {
      connect: vi.fn(async (_username: string) => undefined),
      disconnect: vi.fn(async () => undefined),
      addManualVote: vi.fn(async () => undefined),
      removeManualVote: vi.fn(async () => undefined),
      resetVotes: vi.fn(async () => undefined),
      setTarget: vi.fn(async (_target: number) => undefined),
      setOverlaySettings: vi.fn(async () => undefined)
    } satisfies FlagCountActions;
    const onCopyText = vi.fn(async (_text: string) => undefined);
    const user = userEvent.setup();
    render(
      <Dashboard
        state={state}
        error={null}
        pending={false}
        actions={actions}
        onDismissError={vi.fn()}
        onCopyText={onCopyText}
      />
    );

    await user.click(screen.getByRole('button', { name: 'URL kopieren' }));
    await user.click(checkbox('Hintergrund anzeigen'));

    expect(onCopyText).toHaveBeenCalledWith(OVERLAY_URL);
    expect(actions.setOverlaySettings).toHaveBeenCalledWith({ ...DEFAULT_OVERLAY_SETTINGS, showBackground: false, showProgress: true });
  });
});
