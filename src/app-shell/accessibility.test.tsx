// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppState } from '../../shared/appState';
import { createRedFlagCounter } from '../../shared/profiles';
import { Dashboard } from '../dashboard/Dashboard';
import { LICENSES, PUBLIC_OVERLAY_URL, createActions, createAppState, createSettings, historyRound, teamPoll } from '../test/appStateFixtures';

afterEach(cleanup);

const NAMED_ROLES = ['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'switch', 'radio', 'spinbutton', 'slider', 'tab', 'dialog'] as const;
const ID_REFERENCES = ['aria-labelledby', 'aria-describedby', 'aria-controls'] as const;
/** Every page is rendered and queried by role, which takes a while in jsdom. */
const SWEEP_TIMEOUT_MS = 30_000;

/** Structural checks that catch the most common critical accessibility problems without extra tooling. */
function expectAccessible(context: string): void {
  expect(screen.getAllByRole('heading', { level: 1 }), `${context}: one page title`).toHaveLength(1);

  for (const role of NAMED_ROLES) {
    const named = new Set(screen.queryAllByRole(role, { name: /\S/ }));
    const unnamed = screen.queryAllByRole(role).filter((element) => !named.has(element));
    expect(unnamed.map((element) => element.outerHTML.slice(0, 120)), `${context}: ${role} without a name`).toEqual([]);
  }

  const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
  expect(ids.filter((id, index) => ids.indexOf(id) !== index), `${context}: duplicate ids`).toEqual([]);

  for (const attribute of ID_REFERENCES) {
    for (const element of document.querySelectorAll(`[${attribute}]`)) {
      for (const reference of (element.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean)) {
        expect(document.getElementById(reference), `${context}: ${attribute}="${reference}" points nowhere`).not.toBeNull();
      }
    }
  }

  for (const frame of document.querySelectorAll('iframe')) {
    expect(frame.getAttribute('title'), `${context}: iframe without a title`).toBeTruthy();
  }
}

const PAGES = ['Cockpit', 'Zähler & Abstimmungen', 'Overlays', 'Profile', 'Historie', 'Pro & Lizenz', 'Einstellungen'];

function renderApp(state: AppState, desktop = true) {
  render(
    <Dashboard
      state={state}
      error={null}
      pending={false}
      actions={createActions()}
      onDismissError={() => undefined}
      onCopyText={async () => undefined}
      version="0.4.0"
      proAvailable={desktop}
      onLogout={desktop ? undefined : () => undefined}
    />
  );
  return userEvent.setup();
}

const openPage = (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getByRole('button', { name }));

describe('Accessibility of every page', () => {
  it.each([
    ['Free', createAppState()],
    [
      'Pro with parallel elements and history',
      createAppState({
        license: LICENSES.pro,
        settings: { ...createSettings([createRedFlagCounter(10), teamPoll()]), username: 'streamer' },
        publicOverlayUrl: PUBLIC_OVERLAY_URL,
        counterOverlayUrls: { teams: 'https://overlay.example.test/c/teams', all: 'https://overlay.example.test/c/all' },
        history: [historyRound()]
      })
    ],
    ['an incomplete Pro license', createAppState({ license: LICENSES.proWithoutPolls })]
  ])('has named controls and valid references on %s', async (context, state) => {
    const user = renderApp(state);

    for (const page of PAGES) {
      await openPage(user, page);
      expectAccessible(`${context} – ${page}`);
    }
  }, SWEEP_TIMEOUT_MS);

  it('keeps dialogs and tabs consistent while they are open', async () => {
    const user = renderApp(createAppState({ license: LICENSES.pro, settings: createSettings([createRedFlagCounter(10), teamPoll()]) }));

    await openPage(user, 'Zähler & Abstimmungen');
    await user.click(screen.getByRole('button', { name: 'Neues Element' }));
    for (let step = 0; step < 6; step++) {
      expectAccessible(`wizard step ${step + 1}`);
      const next = screen.queryByRole('button', { name: 'Weiter' });
      if (!next) break;
      await user.click(next);
    }
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

    await openPage(user, 'Overlays');
    await user.click(screen.getByRole('tab', { name: 'Einrichtung' }));
    expectAccessible('overlay setup guide');
  }, SWEEP_TIMEOUT_MS);

  it('keeps the browser dashboard accessible', async () => {
    const user = renderApp(createAppState(), false);

    for (const page of ['Cockpit', 'Overlays', 'Einstellungen']) {
      await openPage(user, page);
      expectAccessible(`web – ${page}`);
    }
  }, SWEEP_TIMEOUT_MS);
});
