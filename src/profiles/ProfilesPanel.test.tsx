// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEATURES } from '../../shared/entitlements';
import { FREE_LICENSE_STATE, type LicenseState } from '../../shared/licensing';
import { createDefaultSettings, type Settings } from '../../shared/profiles';
import { ProfilesPanel } from './ProfilesPanel';

afterEach(cleanup);

const NOW = '2026-09-13T12:00:00.000Z';
const PRO: LicenseState = { ...FREE_LICENSE_STATE, plan: 'pro', status: 'active', features: [...FEATURES] };

function settingsWith(names: string[]): Settings {
  const base = createDefaultSettings(NOW);
  const [first] = base.profiles;
  return {
    ...base,
    profiles: names.map((name, index) => ({ ...first!, id: index === 0 ? 'default' : `p${index}`, name }))
  };
}

function renderPanel(overrides: Partial<ComponentProps<typeof ProfilesPanel>> = {}) {
  const props: ComponentProps<typeof ProfilesPanel> = {
    settings: settingsWith(['Standard']),
    license: FREE_LICENSE_STATE,
    disabled: false,
    onCreate: vi.fn(),
    onDuplicate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onSwitch: vi.fn(),
    onShowPro: vi.fn(),
    ...overrides
  };
  render(<ProfilesPanel {...props} />);
  return { props, user: userEvent.setup() };
}

describe('ProfilesPanel', () => {
  it('shows the Free limit and explains what Pro adds instead of failing later', async () => {
    const { props, user } = renderPanel();

    expect(screen.getByText('1 von 1 Profil')).toBeTruthy();
    expect(screen.queryByLabelText('Neues Profil')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Standard duplizieren' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Mehr zu Pro' }));

    expect(props.onShowPro).toHaveBeenCalled();
  });

  it('creates profiles with a trimmed name on Pro', async () => {
    const { props, user } = renderPanel({ license: PRO });

    expect(screen.getByText('1 von 10 Profilen')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(screen.getByText('Bitte gib dem Profil einen Namen.')).toBeTruthy();
    await user.type(screen.getByLabelText('Neues Profil'), '  Quiz-Abend ');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(props.onCreate).toHaveBeenCalledWith('Quiz-Abend');
  });

  it('asks before switching, because running rounds end', async () => {
    const { props, user } = renderPanel({ license: PRO, settings: settingsWith(['Standard', 'Quiz']) });

    await user.click(screen.getByRole('button', { name: 'Zu Quiz wechseln' }));
    const confirm = screen.getByRole('group', { name: 'Wechsel zu Quiz bestätigen' });
    expect(within(confirm).getByText('Laufende Runden werden beim Wechsel beendet.')).toBeTruthy();
    expect(props.onSwitch).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Ja, wechseln' }));

    expect(props.onSwitch).toHaveBeenCalledWith('p1');
  });

  it('renames, duplicates and deletes after confirmation', async () => {
    const { props, user } = renderPanel({ license: PRO, settings: settingsWith(['Standard', 'Quiz']) });

    await user.click(screen.getByRole('button', { name: 'Quiz umbenennen' }));
    const input = screen.getByLabelText('Neuer Name für Quiz');
    await user.clear(input);
    await user.type(input, 'Quiz 2');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await user.click(screen.getByRole('button', { name: 'Standard duplizieren' }));
    await user.click(screen.getByRole('button', { name: 'Quiz löschen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, löschen' }));

    expect(props.onRename).toHaveBeenCalledWith('p1', 'Quiz 2');
    expect(props.onDuplicate).toHaveBeenCalledWith('default');
    expect(props.onDelete).toHaveBeenCalledWith('p1');
  });

  it('keeps Pro profiles after a downgrade but marks them inactive', () => {
    renderPanel({ settings: settingsWith(['Standard', 'Quiz', 'Turnier']) });

    expect(screen.getByText('3 von 1 Profil')).toBeTruthy();
    expect(screen.getAllByText('Pro').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('button', { name: 'Zu Quiz wechseln' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quiz umbenennen' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Quiz löschen' })).toBeTruthy();
    expect(screen.getByText(/wieder nutzbar, sobald FlagCount Pro aktiv ist/)).toBeTruthy();
  });

  it('never offers to delete the last profile', () => {
    renderPanel({ license: PRO });

    expect(screen.queryByRole('button', { name: 'Standard löschen' })).toBeNull();
  });
});
