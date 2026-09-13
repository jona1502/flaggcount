// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionState } from '../../shared/appState';
import { ConnectionPanel } from './ConnectionPanel';

afterEach(cleanup);

function renderPanel(connection: ConnectionState, savedUsername: string) {
  const onConnect = vi.fn();
  render(
    <ConnectionPanel
      connection={connection}
      savedUsername={savedUsername}
      sidecarRunning
      pending={false}
      onConnect={onConnect}
      onDisconnect={vi.fn()}
    />
  );
  return { onConnect, input: screen.getByLabelText('TikTok-Benutzername') as HTMLInputElement };
}

describe('ConnectionPanel', () => {
  it('prefills the username from the last session', async () => {
    const { onConnect, input } = renderPanel({ status: 'disconnected', username: null }, 'streamer');

    expect(input.value).toBe('streamer');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Verbinden' }));

    expect(onConnect).toHaveBeenCalledWith('streamer');
  });

  it('prefers the username of the active connection', () => {
    const { input } = renderPanel({ status: 'connected', username: 'live' }, 'old');

    expect(input.value).toBe('live');
  });
});
