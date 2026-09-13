// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppError, AppState } from '../../shared/appState';
import type { FlagCountActions } from '../api/useFlagCount';
import { Dashboard } from './Dashboard';
import { ERROR_MESSAGES } from './errorMessages';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const baseState: AppState = {
  sidecarRunning: true,
  connection: { status: 'disconnected', username: null },
  votes: { count: 0, target: 10, roundId: 'r1', targetReached: false },
  overlayUrl: 'http://127.0.0.1:3847/overlay',
  settings: { username: '', target: 10, overlay: { showBackground: true, showProgress: true } }
};

type RenderOptions = {
  state?: AppState | null;
  error?: AppError | null;
  pending?: boolean;
};

function renderDashboard({ state = baseState, error = null, pending = false }: RenderOptions = {}) {
  const actions = {
    connect: vi.fn(async (_username: string) => undefined),
    disconnect: vi.fn(async () => undefined),
    resetVotes: vi.fn(async () => undefined),
    setTarget: vi.fn(async (_target: number) => undefined),
    setOverlaySettings: vi.fn(async () => undefined)
  } satisfies FlagCountActions;
  const onDismissError = vi.fn();
  const onCopyText = vi.fn(async (_text: string) => undefined);

  render(
    <Dashboard
      state={state}
      error={error}
      pending={pending}
      actions={actions}
      onDismissError={onDismissError}
      onCopyText={onCopyText}
      version="0.1.0"
    />
  );

  return { actions, onDismissError, onCopyText, user: userEvent.setup() };
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('Dashboard', () => {
  it('shows a loading hint until the state is known', () => {
    renderDashboard({ state: null });

    expect(screen.getByText('Status wird geladen …')).toBeTruthy();
  });

  describe('connection', () => {
    it('connects with the entered username', async () => {
      const { actions, user } = renderDashboard();

      await user.type(screen.getByLabelText('TikTok-Benutzername'), '  @streamer ');
      await user.click(button('Verbinden'));

      expect(actions.connect).toHaveBeenCalledWith('@streamer');
      expect(screen.getByRole('status').textContent).toBe('Nicht verbunden');
    });

    it('asks for a username before connecting', async () => {
      const { actions, user } = renderDashboard();

      await user.click(button('Verbinden'));

      expect(actions.connect).not.toHaveBeenCalled();
      expect(screen.getByText('Bitte gib einen TikTok-Benutzernamen ein.')).toBeTruthy();
    });

    it('shows the connected stream and disconnects', async () => {
      const { actions, user } = renderDashboard({
        state: { ...baseState, connection: { status: 'connected', username: 'streamer' } }
      });

      expect(screen.getByRole('status').textContent).toBe('Verbunden mit @streamer');
      expect((screen.getByLabelText('TikTok-Benutzername') as HTMLInputElement).disabled).toBe(true);

      await user.click(button('Trennen'));

      expect(actions.disconnect).toHaveBeenCalledTimes(1);
    });

    it('allows cancelling a pending connection', async () => {
      const { actions, user } = renderDashboard({
        state: { ...baseState, connection: { status: 'connecting', username: 'streamer' } }
      });

      expect(screen.getByRole('status').textContent).toBe('Verbinde mit @streamer …');
      await user.click(button('Abbrechen'));

      expect(actions.disconnect).toHaveBeenCalledTimes(1);
    });

    it('shows automatic reconnect attempts and lets the user stop them', async () => {
      const { actions, user } = renderDashboard({
        state: {
          ...baseState,
          connection: {
            status: 'reconnecting',
            username: 'streamer',
            reconnect: { attempt: 2, maxAttempts: 8, delayMs: 4000 }
          }
        }
      });

      expect(screen.getByRole('status').textContent).toBe(
        'Verbindung zu @streamer unterbrochen – neuer Versuch 2 von 8 in 4 s'
      );
      await user.click(button('Trennen'));

      expect(actions.disconnect).toHaveBeenCalledTimes(1);
      expect(actions.connect).not.toHaveBeenCalled();
    });

    it('disables all actions when the connection service is unavailable', () => {
      renderDashboard({ state: { ...baseState, sidecarRunning: false } });

      expect(screen.getByRole('status').textContent).toBe('Verbindungsdienst nicht verfügbar');
      expect(button('Verbinden').disabled).toBe(true);
      expect(button('Übernehmen').disabled).toBe(true);
      expect(button('Runde zurücksetzen').disabled).toBe(true);
    });
  });

  describe('votes', () => {
    it('shows the count, target and progress', () => {
      renderDashboard({ state: { ...baseState, votes: { ...baseState.votes, count: 4 } } });

      expect(screen.getByTestId('vote-count').textContent).toBe('4');
      expect(screen.getByText('von 10 Stimmen')).toBeTruthy();
      const progress = screen.getByRole('progressbar');
      expect(progress.getAttribute('aria-valuenow')).toBe('4');
      expect(progress.getAttribute('aria-valuemax')).toBe('10');
      expect(screen.queryByText('Ziel erreicht!')).toBeNull();
    });

    it('highlights a reached target', () => {
      renderDashboard({
        state: { ...baseState, votes: { count: 12, target: 10, roundId: 'r1', targetReached: true } }
      });

      expect(screen.getByText('Ziel erreicht!')).toBeTruthy();
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('10');
    });

    it('formats large numbers for German readers', () => {
      renderDashboard({
        state: { ...baseState, votes: { count: 1234, target: 10000, roundId: 'r1', targetReached: false } }
      });

      expect(screen.getByTestId('vote-count').textContent).toBe('1.234');
      expect(screen.getByText('von 10.000 Stimmen')).toBeTruthy();
    });

    it('changes the target', async () => {
      const { actions, user } = renderDashboard();
      const input = screen.getByLabelText('Stimmenziel');

      await user.clear(input);
      await user.type(input, '25');
      await user.click(button('Übernehmen'));

      expect(actions.setTarget).toHaveBeenCalledWith(25);
    });

    it.each(['0', '2.5', '100001', ''])('rejects the target %j with a German message', async (value) => {
      const { actions, user } = renderDashboard();
      const input = screen.getByLabelText('Stimmenziel');

      await user.clear(input);
      if (value) await user.type(input, value);
      await user.click(button('Übernehmen'));

      expect(actions.setTarget).not.toHaveBeenCalled();
      expect(screen.getByText(ERROR_MESSAGES['invalid-target'])).toBeTruthy();
    });
  });

  describe('reset', () => {
    it('requires a confirmation before resetting', async () => {
      const { actions, user } = renderDashboard();

      await user.click(button('Runde zurücksetzen'));
      expect(actions.resetVotes).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(button('Abbrechen'));

      await user.click(button('Ja, zurücksetzen'));

      expect(actions.resetVotes).toHaveBeenCalledTimes(1);
      expect(button('Runde zurücksetzen')).toBeTruthy();
    });

    it('can be cancelled', async () => {
      const { actions, user } = renderDashboard();

      await user.click(button('Runde zurücksetzen'));
      await user.click(button('Abbrechen'));

      expect(actions.resetVotes).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Ja, zurücksetzen' })).toBeNull();
    });

    it('cancels the confirmation automatically after a few seconds', () => {
      vi.useFakeTimers();
      const { actions } = renderDashboard();

      fireEvent.click(button('Runde zurücksetzen'));
      expect(screen.getByRole('button', { name: 'Ja, zurücksetzen' })).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.queryByRole('button', { name: 'Ja, zurücksetzen' })).toBeNull();
      expect(actions.resetVotes).not.toHaveBeenCalled();
    });
  });

  describe('errors', () => {
    it('shows a German message and can be dismissed', async () => {
      const { onDismissError, user } = renderDashboard({ error: { code: 'user-offline', message: "isn't online" } });

      expect(screen.getByRole('alert').textContent).toContain(ERROR_MESSAGES['user-offline']);
      expect(screen.getByRole('alert').textContent).not.toContain("isn't online");

      await user.click(button('Fehlermeldung schließen'));

      expect(onDismissError).toHaveBeenCalledTimes(1);
    });
  });
});
