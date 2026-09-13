// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FREE_LICENSE_STATE, type LicenseState } from '../../shared/licensing';
import { LicensePanel } from './LicensePanel';

afterEach(cleanup);

const PRO: LicenseState = {
  plan: 'pro',
  status: 'active',
  reference: 'FC-0F5E9C2A7B',
  expiresAt: '2026-10-13T10:00:00.000Z',
  refreshAfter: '2026-09-20T10:00:00.000Z',
  needsRefresh: false,
  lastError: null,
  features: ['history'],
  installations: []
};

function renderPanel(overrides: Partial<ComponentProps<typeof LicensePanel>> = {}) {
  const props: ComponentProps<typeof LicensePanel> = {
    license: FREE_LICENSE_STATE,
    available: true,
    pending: false,
    onActivate: vi.fn(),
    onRefresh: vi.fn(),
    onDeactivate: vi.fn(),
    onOpenPortal: vi.fn(),
    onOpenProPage: vi.fn(),
    ...overrides
  };
  const view = render(<LicensePanel {...props} />);
  return { props, view, user: userEvent.setup() };
}

describe('LicensePanel', () => {
  it('explains Free and activates a trimmed code', async () => {
    const { props, user } = renderPanel();

    expect(screen.getByText('Du nutzt FlagCount Free')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Aktivieren' }));
    expect(screen.getByText('Bitte gib deinen Aktivierungscode ein.')).toBeTruthy();
    expect(props.onActivate).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Aktivierungscode'), '  FC-7K2QM-9XH4D-PZ1RT-W8C3N ');
    await user.click(screen.getByRole('button', { name: 'Aktivieren' }));

    expect(props.onActivate).toHaveBeenCalledWith('FC-7K2QM-9XH4D-PZ1RT-W8C3N');
  });

  it('shows the Pro benefits and leads to prices and terms without a dialog', async () => {
    const { props, user } = renderPanel();

    expect(screen.getByText('Bis zu vier Zähler gleichzeitig')).toBeTruthy();
    expect(screen.getByText(/automatische Verlängerung und Kündigung/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Preise & Pro ansehen' }));

    expect(props.onOpenProPage).toHaveBeenCalled();
  });

  it('lets another computer be replaced when all installations are in use', async () => {
    const installations = [
      { installationId: 'inst-aaaaaaaaaaaaaaaa', activatedAt: '2026-08-01T10:00:00.000Z', lastSeenAt: '2026-09-01T10:00:00.000Z' },
      { installationId: 'inst-bbbbbbbbbbbbbbbb', activatedAt: '2026-08-02T10:00:00.000Z', lastSeenAt: '2026-09-02T10:00:00.000Z' }
    ];
    const { props, view, user } = renderPanel();
    await user.type(screen.getByLabelText('Aktivierungscode'), 'FC-CODE');
    await user.click(screen.getByRole('button', { name: 'Aktivieren' }));

    view.rerender(<LicensePanel {...props} license={{ ...FREE_LICENSE_STATE, lastError: 'installation-limit', installations }} />);
    const replace = screen.getAllByRole('button', { name: /Computer ersetzen/ });
    await user.click(replace[1]!);

    expect(screen.getByText(/bereits auf 2 Computern aktiv/)).toBeTruthy();
    expect(props.onActivate).toHaveBeenLastCalledWith('FC-CODE', 'inst-bbbbbbbbbbbbbbbb');
  });

  it('manages an active license and asks before deactivating', async () => {
    const { props, user } = renderPanel({ license: PRO });

    expect(screen.getByText('FlagCount Pro ist aktiv')).toBeTruthy();
    expect(screen.getByText('FC-0F5E9C2A7B')).toBeTruthy();
    expect(screen.queryByLabelText('Aktivierungscode')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Lizenz aktualisieren' }));
    await user.click(screen.getByRole('button', { name: 'Abo verwalten' }));
    await user.click(screen.getByRole('button', { name: 'Gerät deaktivieren' }));
    expect(props.onDeactivate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Ja, deaktivieren' }));

    expect(props.onRefresh).toHaveBeenCalled();
    expect(props.onOpenPortal).toHaveBeenCalled();
    expect(props.onDeactivate).toHaveBeenCalled();
  });

  it('explains errors, the payment grace period and offline use', () => {
    const { view } = renderPanel({ license: { ...FREE_LICENSE_STATE, lastError: 'invalid-code' } });
    expect(screen.getByRole('alert').textContent).toContain('Aktivierungscode ist ungültig');

    view.rerender(
      <LicensePanel {...{ available: true, pending: false, onActivate: vi.fn(), onRefresh: vi.fn(), onDeactivate: vi.fn(), onOpenPortal: vi.fn(), onOpenProPage: vi.fn() }} license={{ ...PRO, status: 'grace', needsRefresh: true, lastError: 'network' }} />
    );
    expect(screen.getByText('FlagCount Pro ist aktiv – Zahlung offen')).toBeTruthy();
    expect(screen.getByText(/erneut bestätigt, sobald FlagCount den Lizenzserver erreicht/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('offline');
  });

  it('disables activation while the connection service is unavailable', () => {
    renderPanel({ available: false });

    expect((screen.getByRole('button', { name: 'Aktivieren' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/sobald der Verbindungsdienst läuft/)).toBeTruthy();
  });
});
