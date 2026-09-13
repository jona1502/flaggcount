// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateNotice } from './UpdateNotice';
import type { UpdaterController } from './useUpdater';

afterEach(cleanup);

function controller(overrides: Partial<UpdaterController> = {}): UpdaterController {
  return {
    status: 'available',
    update: { version: '0.2.0', notes: 'Neue Funktionen' },
    progress: null,
    checkForUpdates: vi.fn(async () => undefined),
    installUpdate: vi.fn(async () => undefined),
    dismiss: vi.fn(),
    ...overrides
  };
}

describe('UpdateNotice', () => {
  it('offers an available update for installation or later', async () => {
    const updater = controller();
    const user = userEvent.setup();
    render(<UpdateNotice updater={updater} />);

    expect(screen.getByText('Update 0.2.0 verfügbar')).toBeTruthy();
    expect(screen.getByText('Neue Funktionen')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Jetzt aktualisieren' }));
    expect(updater.installUpdate).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Später' }));
    expect(updater.dismiss).toHaveBeenCalledTimes(1);
  });

  it('shows download progress and prevents duplicate installation', () => {
    render(<UpdateNotice updater={controller({ status: 'downloading', progress: 42 })} />);

    expect(screen.getByText('Download: 42 %')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Wird installiert …' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows manual check results', () => {
    const { rerender } = render(<UpdateNotice updater={controller({ status: 'up-to-date', update: null })} />);
    expect(screen.getByRole('status').textContent).toBe('FlagCount ist aktuell.');

    rerender(<UpdateNotice updater={controller({ status: 'error', update: null })} />);
    expect(screen.getByRole('status').textContent).toContain('fehlgeschlagen');
  });
});
