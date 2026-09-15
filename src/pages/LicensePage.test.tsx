// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppState } from '../../shared/appState';
import { FEATURES } from '../../shared/entitlements';
import type { LicenseState } from '../../shared/licensing';
import { Dashboard } from '../dashboard/Dashboard';
import { LICENSES, createActions, createAppState } from '../test/appStateFixtures';

afterEach(cleanup);

async function renderLicense(state: AppState) {
  const actions = createActions();
  const element = (next: AppState) => (
    <Dashboard state={next} error={null} pending={false} actions={actions} onDismissError={() => undefined} onCopyText={async () => undefined} proAvailable />
  );
  const view = render(element(state));
  const user = userEvent.setup();
  await user.click(within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getByRole('button', { name: 'Pro & Lizenz' }));
  return { actions, user, rerender: (next: AppState) => act(() => view.rerender(element(next))) };
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const featureStates = () =>
  within(screen.getByRole('list', { name: 'Pro-Funktionen' }))
    .getAllByRole('listitem')
    .map((item) => [item.querySelector('strong')?.textContent, item.querySelector('.ui-badge')?.textContent]);

describe('Pro & Lizenz', () => {
  it('explains Free and activates a trimmed code', async () => {
    const { actions, user } = await renderLicense(createAppState());

    expect(screen.getByText('Du nutzt Audience Live Free')).toBeTruthy();
    await user.click(button('Aktivieren'));
    expect(screen.getByText('Bitte gib deinen Aktivierungscode ein.')).toBeTruthy();
    expect(actions.activateLicense).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Aktivierungscode'), '  FC-7K2QM-9XH4D-PZ1RT-W8C3N ');
    await user.click(button('Aktivieren'));

    expect(actions.activateLicense.mock.calls[0]?.[0]).toBe('FC-7K2QM-9XH4D-PZ1RT-W8C3N');
  });

  it('shows the Pro benefits, limits and terms without a dialog', async () => {
    const { actions, user } = await renderLicense(createAppState());

    expect(featureStates()).toContainEqual(['Bis zu vier Zähler gleichzeitig', 'ProMit Audience Live Pro']);
    const limits = screen.getByRole('table', { name: 'Grenzen deines Tarifs' });
    expect(within(limits).getByRole('row', { name: 'Gespeicherte Profile 1 10' })).toBeTruthy();
    expect(within(limits).getByRole('row', { name: 'Optionen pro Abstimmung keine Abstimmungen bis 6' })).toBeTruthy();
    expect(screen.getByText(/automatische Verlängerung und Kündigung/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(button('Preise & Pro ansehen'));
    expect(actions.openProPage).toHaveBeenCalled();
  });

  it('lets another computer be replaced when all installations are in use', async () => {
    const installations = [
      { installationId: 'inst-aaaaaaaaaaaaaaaa', activatedAt: '2026-08-01T10:00:00.000Z', lastSeenAt: '2026-09-01T10:00:00.000Z' },
      { installationId: 'inst-bbbbbbbbbbbbbbbb', activatedAt: '2026-08-02T10:00:00.000Z', lastSeenAt: '2026-09-02T10:00:00.000Z' }
    ];
    const state = createAppState();
    const { actions, user, rerender } = await renderLicense(state);
    await user.type(screen.getByLabelText('Aktivierungscode'), 'FC-CODE');
    await user.click(button('Aktivieren'));

    rerender({ ...state, license: { ...LICENSES.free, lastError: 'installation-limit', installations } });
    expect(screen.getByRole('note', { name: 'Diese Lizenz ist bereits auf 2 Computern aktiv' })).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: /Computer ersetzen/ })[1]!);

    expect(actions.activateLicense).toHaveBeenLastCalledWith('FC-CODE', 'inst-bbbbbbbbbbbbbbbb');
  });

  it('manages an active license and shows what it unlocks', async () => {
    const { actions, user } = await renderLicense(createAppState({ license: LICENSES.pro }));

    expect(screen.getByText('Audience Live Pro ist aktiv')).toBeTruthy();
    expect(screen.getByText('FC-TESTLICENSE')).toBeTruthy();
    expect(screen.getByText('Nächste Online-Prüfung')).toBeTruthy();
    expect(screen.getByText('Offline gültig bis')).toBeTruthy();
    expect(screen.queryByLabelText('Aktivierungscode')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preise & Pro ansehen' })).toBeNull();
    expect(featureStates().every(([, state]) => state === 'aktiv')).toBe(true);
    expect(featureStates()).toHaveLength(FEATURES.length);

    await user.click(button('Lizenzstatus aktualisieren'));
    await user.click(button('Abo verwalten'));
    await user.click(button('Gerät deaktivieren'));
    expect(actions.deactivateLicense).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog', { name: 'Pro auf diesem Computer deaktivieren?' })).getByRole('button', { name: 'Ja, deaktivieren' }));

    expect(actions.refreshLicense).toHaveBeenCalled();
    expect(actions.openCustomerPortal).toHaveBeenCalled();
    expect(actions.deactivateLicense).toHaveBeenCalled();
  });

  it('diagnoses missing Pro features instead of offering an upgrade', async () => {
    const { actions, user } = await renderLicense(createAppState({ license: LICENSES.proWithoutPolls }));

    const diagnosis = screen.getByRole('note', { name: 'Pro-Funktionen fehlen' });
    expect(diagnosis.textContent).toContain('Abstimmungen mit bis zu sechs Optionen');
    expect(diagnosis.textContent).not.toMatch(/signatur|keyId/i);
    expect(featureStates()).toContainEqual(['Abstimmungen mit bis zu sechs Optionen', 'nicht freigegeben']);
    expect(screen.queryByRole('button', { name: 'Preise & Pro ansehen' })).toBeNull();
    expect(within(diagnosis).getByRole('link', { name: 'Support kontaktieren' }).getAttribute('href')).toContain('FC-TESTLICENSE');

    await user.click(within(diagnosis).getByRole('button', { name: 'Erneut prüfen' }));
    expect(actions.refreshLicense).toHaveBeenCalled();
  });

  it('explains errors, the payment grace period and offline use', async () => {
    const state = createAppState({ license: { ...LICENSES.free, lastError: 'invalid-code' } });
    const { rerender } = await renderLicense(state);
    expect(screen.getByRole('alert').textContent).toContain('Aktivierungscode ist ungültig');

    const grace: LicenseState = { ...LICENSES.grace, needsRefresh: true, lastError: 'network' };
    rerender({ ...state, license: grace });
    expect(screen.getByText('Audience Live Pro ist aktiv – Zahlung offen')).toBeTruthy();
    expect(screen.getByText('Zahlung offen')).toBeTruthy();
    expect(screen.getByText(/erneut bestätigt, sobald Audience Live den Lizenzserver erreicht/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('offline');
  });

  it('disables activation while the connection service is unavailable', async () => {
    await renderLicense(createAppState({ sidecarRunning: false }));

    expect(button('Aktivieren').disabled).toBe(true);
    expect(screen.getByText(/sobald der Verbindungsdienst läuft/)).toBeTruthy();
  });

  it('unlocks Pro without a restart and leads straight to creating a poll', async () => {
    const state = createAppState();
    const { user, rerender } = await renderLicense(state);

    rerender({ ...state, license: LICENSES.pro });

    expect(screen.getByRole('region', { name: 'Benachrichtigungen' }).textContent).toContain('Audience Live Pro ist aktiv');
    await user.click(within(screen.getByRole('note', { name: 'Pro ist freigeschaltet' })).getByRole('button', { name: 'Abstimmung erstellen' }));
    const poll = within(screen.getByRole('dialog', { name: 'Neues Element' })).getByRole('radio', { name: 'Abstimmung' }) as HTMLInputElement;
    expect(poll.disabled).toBe(false);
  });
});
