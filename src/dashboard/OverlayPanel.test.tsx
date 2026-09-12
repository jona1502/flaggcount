// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../../shared/appState';
import { Dashboard } from './Dashboard';
import { OverlayPanel } from './OverlayPanel';

const OVERLAY_URL = 'http://127.0.0.1:3847/overlay';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('OverlayPanel', () => {
  it('shows the overlay URL', () => {
    render(<OverlayPanel overlayUrl={OVERLAY_URL} onCopy={vi.fn()} />);

    expect((screen.getByLabelText('Als Browserquelle in OBS hinzufügen') as HTMLInputElement).value).toBe(OVERLAY_URL);
  });

  it('copies the URL and confirms it', async () => {
    const onCopy = vi.fn(async (_text: string) => undefined);
    const user = userEvent.setup();
    render(<OverlayPanel overlayUrl={OVERLAY_URL} onCopy={onCopy} />);

    await user.click(screen.getByRole('button', { name: 'URL kopieren' }));

    expect(onCopy).toHaveBeenCalledWith(OVERLAY_URL);
    expect(screen.getByRole('button', { name: 'Kopiert!' })).toBeTruthy();
  });

  it('resets the confirmation after a moment', async () => {
    vi.useFakeTimers();
    render(<OverlayPanel overlayUrl={OVERLAY_URL} onCopy={vi.fn(async (_text: string) => undefined)} />);

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
    const onCopy = vi.fn(async (_text: string) => {
      throw new Error('denied');
    });
    const user = userEvent.setup();
    render(<OverlayPanel overlayUrl={OVERLAY_URL} onCopy={onCopy} />);

    await user.click(screen.getByRole('button', { name: 'URL kopieren' }));

    expect(screen.getByRole('alert').textContent).toContain('manuell');
  });

  it('shows a hint while no overlay URL is available', () => {
    render(<OverlayPanel overlayUrl={null} onCopy={vi.fn()} />);

    expect(screen.getByText('Die Overlay-URL ist verfügbar, sobald der Verbindungsdienst läuft.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is part of the dashboard', async () => {
    const state: AppState = {
      sidecarRunning: true,
      connection: { status: 'disconnected', username: null },
      votes: { count: 0, target: 10, roundId: 'r1', targetReached: false },
      overlayUrl: OVERLAY_URL
    };
    const onCopyText = vi.fn(async (_text: string) => undefined);
    const user = userEvent.setup();
    render(
      <Dashboard
        state={state}
        error={null}
        pending={false}
        actions={{
          connect: vi.fn(async () => undefined),
          disconnect: vi.fn(async () => undefined),
          resetVotes: vi.fn(async () => undefined),
          setTarget: vi.fn(async () => undefined)
        }}
        onDismissError={vi.fn()}
        onCopyText={onCopyText}
      />
    );

    await user.click(screen.getByRole('button', { name: 'URL kopieren' }));

    expect(onCopyText).toHaveBeenCalledWith(OVERLAY_URL);
  });
});
