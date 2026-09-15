// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../../shared/appState';
import { Dashboard } from '../dashboard/Dashboard';
import { LICENSES, createActions, createAppState } from '../test/appStateFixtures';
import type { UpdaterController } from '../updater/useUpdater';

afterEach(cleanup);

const DESKTOP_PAGES = ['Cockpit', 'Zähler & Abstimmungen', 'Overlays', 'Profile', 'Historie', 'Pro & Lizenz', 'Einstellungen'];

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
  const actions = createActions();
  render(
    <Dashboard
      state={state}
      error={null}
      pending={false}
      actions={actions}
      onDismissError={() => undefined}
      onCopyText={async () => undefined}
      version="0.4.0"
      updater={updater}
      onLogout={onLogout}
      proAvailable={desktop}
    />
  );
  return { actions, user: userEvent.setup() };
}

const navigation = () => screen.getByRole('navigation', { name: 'Hauptnavigation' });
const navItem = (name: string) => within(navigation()).getByRole('button', { name });
const pageTitle = () => screen.getByRole('heading', { level: 1 });
const topBar = () => screen.getByRole('banner', { name: 'Stream-Status' });

describe('App shell', () => {
  it('groups every desktop area and starts on the cockpit', () => {
    renderShell();

    expect(within(navigation()).getAllByRole('button').map((button) => button.textContent?.replace(/(Free|Pro)$/, ''))).toEqual(
      DESKTOP_PAGES
    );
    expect(within(navigation()).getAllByRole('list').map((list) => list.getAttribute('aria-labelledby') && document.getElementById(list.getAttribute('aria-labelledby')!)?.textContent)).toEqual(['Stream', 'Einrichten', 'Konto']);
    expect(navItem('Cockpit').getAttribute('aria-current')).toBe('page');
    expect(pageTitle().textContent).toBe('Cockpit');
  });

  it('navigates with the keyboard and moves focus to the new page title', async () => {
    const { user } = renderShell();

    navItem('Historie').focus();
    await user.keyboard('{Enter}');

    expect(pageTitle().textContent).toBe('Historie');
    expect(document.activeElement).toBe(pageTitle());
    expect(navItem('Historie').getAttribute('aria-current')).toBe('page');
    expect(navItem('Cockpit').getAttribute('aria-current')).toBeNull();
  });

  it('keeps the browser dashboard to the areas it supports', () => {
    const onLogout = vi.fn();
    renderShell({ desktop: false, onLogout });

    expect(within(navigation()).getAllByRole('button').map((button) => button.textContent)).toEqual(['Cockpit', 'Overlays', 'Einstellungen']);
    expect(pageTitle().textContent).toBe('Cockpit');
    expect(within(topBar()).queryByRole('button', { name: 'Free' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Abmelden' }).length).toBeGreaterThan(0);
  });

  it('shows connection, running profile and plan in the top bar and the version in the sidebar', async () => {
    const { user } = renderShell({
      state: createAppState({ license: LICENSES.pro, connection: { status: 'connected', username: 'streamer' } })
    });

    expect(within(topBar()).getByRole('status').textContent).toBe('Verbunden mit @streamer');
    expect(topBar().textContent).toContain('Standard');
    expect(screen.getByText('Version 0.4.0')).toBeTruthy();

    await user.click(within(topBar()).getByRole('button', { name: 'Pro' }));
    expect(pageTitle().textContent).toBe('Pro & Lizenz');
  });

  it('connects from the top bar on any page', async () => {
    const { actions, user } = renderShell();

    await user.click(navItem('Overlays'));
    await user.click(within(topBar()).getByRole('button', { name: 'LIVE verbinden' }));
    const drawer = screen.getByRole('dialog', { name: 'LIVE-Verbindung' });
    await user.type(within(drawer).getByLabelText('TikTok-Benutzername'), 'streamer');
    await user.click(within(drawer).getByRole('button', { name: 'Verbinden' }));

    expect(actions.connect).toHaveBeenCalledWith('streamer');
  });

  it('collapses the sidebar without losing the names of its entries', async () => {
    const { user } = renderShell();
    const toggle = screen.getByRole('button', { name: 'Seitenleiste einklappen' });

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await user.click(toggle);

    expect(screen.getByRole('button', { name: 'Seitenleiste ausklappen' }).getAttribute('aria-expanded')).toBe('false');
    expect(navItem('Overlays')).toBeTruthy();
  });

  it('keeps an available update visible on every page and the manual check in the settings', async () => {
    const { user } = renderShell({ updater: updaterWith('available') });

    expect(screen.getByText('Update 9.9.9 verfügbar')).toBeTruthy();
    await user.click(navItem('Einstellungen'));
    expect(screen.getAllByText('Update 9.9.9 verfügbar')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Nach Updates suchen' })).toBeTruthy();
    expect(screen.getByText('0.4.0')).toBeTruthy();
  });
});

describe('Cockpit', () => {
  it('lists open setup steps and links each of them', async () => {
    const { user } = renderShell({ state: createAppState({ license: LICENSES.expired }) });
    const checklist = screen.getByRole('region', { name: 'Einrichtung' });

    expect(within(checklist).getByText('2 von 3 Schritten erledigt')).toBeTruthy();
    await user.click(within(checklist).getByRole('button', { name: 'Lizenz prüfen' }));

    expect(pageTitle().textContent).toBe('Pro & Lizenz');
  });

  it('hides the setup once everything is ready and the connection form while live', () => {
    renderShell({ state: createAppState({ license: LICENSES.pro, connection: { status: 'connected', username: 'streamer' } }) });

    expect(screen.queryByRole('region', { name: 'Einrichtung' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'LIVE-Verbindung' })).toBeNull();
    expect(screen.getByRole('article', { name: 'Rote Flaggen' })).toBeTruthy();
  });
});
