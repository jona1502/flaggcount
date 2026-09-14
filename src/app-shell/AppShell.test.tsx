// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../../shared/appState';
import { Dashboard } from '../dashboard/Dashboard';
import { LICENSES, createActions, createAppState, createSettings, teamPoll } from '../test/appStateFixtures';
import type { UpdaterController } from '../updater/useUpdater';

afterEach(cleanup);

const DESKTOP_PAGES = [
  'Übersicht',
  'Live-Steuerung',
  'Zähler & Abstimmungen',
  'Overlays',
  'Profile',
  'Historie',
  'Lizenz & Konto',
  'Einstellungen'
];

function updaterWith(status: UpdaterController['status']): UpdaterController {
  return {
    status,
    update: status === 'available' ? { version: '9.9.9' } : null,
    progress: null,
    checkForUpdates: vi.fn(async () => undefined),
    installUpdate: vi.fn(async () => undefined),
    dismiss: vi.fn()
  };
}

function renderShell({
  state = createAppState(),
  desktop = true,
  updater,
  onLogout
}: { state?: AppState; desktop?: boolean; updater?: UpdaterController; onLogout?: () => void } = {}) {
  render(
    <Dashboard
      state={state}
      error={null}
      pending={false}
      actions={createActions()}
      onDismissError={() => undefined}
      onCopyText={async () => undefined}
      version="0.4.0"
      updater={updater}
      onLogout={onLogout}
      proAvailable={desktop}
    />
  );
  return userEvent.setup();
}

const navigation = () => screen.getByRole('navigation', { name: 'Hauptnavigation' });
const navItem = (name: string) => within(navigation()).getByRole('button', { name });
const pageTitle = () => screen.getByRole('heading', { level: 1 });

describe('App shell', () => {
  it('lists every desktop area and marks the current page', () => {
    renderShell();

    expect(within(navigation()).getAllByRole('button').map((button) => button.textContent?.replace(/(Free|Pro)$/, ''))).toEqual(
      DESKTOP_PAGES
    );
    expect(navItem('Übersicht').getAttribute('aria-current')).toBe('page');
    expect(pageTitle().textContent).toBe('Übersicht');
  });

  it('navigates with the keyboard and moves focus to the new page title', async () => {
    const user = renderShell();

    navItem('Historie').focus();
    await user.keyboard('{Enter}');

    expect(pageTitle().textContent).toBe('Historie');
    expect(document.activeElement).toBe(pageTitle());
    expect(navItem('Historie').getAttribute('aria-current')).toBe('page');
    expect(navItem('Übersicht').getAttribute('aria-current')).toBeNull();
  });

  it('keeps the browser dashboard to the areas it supports', () => {
    const onLogout = vi.fn();
    renderShell({ desktop: false, onLogout });

    expect(within(navigation()).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Live-Steuerung',
      'Overlays',
      'Einstellungen'
    ]);
    expect(pageTitle().textContent).toBe('Live-Steuerung');
    expect(screen.getAllByRole('button', { name: 'Abmelden' }).length).toBeGreaterThan(0);
  });

  it('shows connection, running profile, plan and version in the status bar', async () => {
    const user = renderShell({
      state: createAppState({ license: LICENSES.pro, connection: { status: 'connected', username: 'streamer' } })
    });
    const statusBar = screen.getByRole('contentinfo', { name: 'Statusleiste' });

    expect(statusBar.textContent).toContain('Verbunden mit @streamer');
    expect(statusBar.textContent).toContain('Standard');
    expect(statusBar.textContent).toContain('1 Element aktiv');
    expect(statusBar.textContent).toContain('Version 0.4.0');

    await user.click(within(statusBar).getByRole('button', { name: 'Pro' }));
    expect(pageTitle().textContent).toBe('Lizenz & Konto');
  });

  it('collapses the sidebar without losing the names of its entries', async () => {
    const user = renderShell();
    const toggle = screen.getByRole('button', { name: 'Seitenleiste einklappen' });

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await user.click(toggle);

    expect(screen.getByRole('button', { name: 'Seitenleiste ausklappen' }).getAttribute('aria-expanded')).toBe('false');
    expect(navItem('Overlays')).toBeTruthy();
  });

  it('keeps an available update visible on every page and the manual check in the settings', async () => {
    const user = renderShell({ updater: updaterWith('available') });

    expect(screen.getByText('Update 9.9.9 verfügbar')).toBeTruthy();
    await user.click(navItem('Einstellungen'));
    expect(screen.getAllByText('Update 9.9.9 verfügbar')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Nach Updates suchen' })).toBeTruthy();
    expect(screen.getByText('0.4.0')).toBeTruthy();
  });
});

describe('Overview', () => {
  it('guides a first start through the setup and links each open step', async () => {
    const user = renderShell({ state: createAppState({ license: LICENSES.expired }) });
    const checklist = screen.getByRole('region', { name: 'Einrichtung' });

    expect(within(checklist).getByText('3 von 5 Schritten erledigt')).toBeTruthy();
    await user.click(within(checklist).getByRole('button', { name: 'Lizenz prüfen' }));

    expect(pageTitle().textContent).toBe('Lizenz & Konto');
  });

  it('shows running rounds and shortcuts to a returning streamer', async () => {
    const poll = teamPoll();
    const settings = { ...createSettings([poll]), username: 'streamer' };
    const state = createAppState({ license: LICENSES.pro, settings });
    const user = renderShell({ state: { ...state, counters: [{ ...state.counters[0]!, totalCount: 3, options: [{ optionId: 'red', label: 'Rot', count: 1 }, { optionId: 'blue', label: 'Blau', count: 2 }] }] } });

    const rounds = screen.getByRole('region', { name: 'Laufende Runden' });
    expect(within(rounds).getByText('Team-Wahl')).toBeTruthy();
    expect(within(rounds).getByText('Vorne: Blau')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Einrichtung' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Overlay einrichten' }));
    expect(pageTitle().textContent).toBe('Overlays');
  });
});
