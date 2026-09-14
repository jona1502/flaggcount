// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppState } from '../../shared/appState';
import { LICENSES, createActions, createAppState } from '../test/appStateFixtures';
import { Dashboard } from './Dashboard';

afterEach(cleanup);

function renderDesktop(state: AppState) {
  const actions = createActions();
  render(
    <Dashboard
      state={state}
      error={null}
      pending={false}
      actions={actions}
      onDismissError={() => undefined}
      onCopyText={async () => undefined}
      proAvailable
    />
  );
  return { actions, user: userEvent.setup() };
}

async function openCounters(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const navigation = screen.getByRole('navigation', { name: 'Hauptnavigation' });
  await user.click(within(navigation).getByRole('button', { name: /Zähler & Abstimmungen/ }));
}

// Reported problem: Pro is active, but creating a poll is hidden inside the profile section.
describe('Pro poll discovery', () => {
  it('lets an active Pro user find "Neues Element" and choose a poll', async () => {
    const { user } = renderDesktop(createAppState({ license: LICENSES.pro }));

    await openCounters(user);
    await user.click(screen.getByRole('button', { name: 'Neues Element' }));

    const dialog = screen.getByRole('dialog', { name: 'Neues Element' });
    const poll = within(dialog).getByRole('radio', { name: /Abstimmung/ }) as HTMLInputElement;
    expect(poll.disabled).toBe(false);
  });

  it('explains a Pro license without the poll feature instead of hiding the action', async () => {
    const { actions, user } = renderDesktop(createAppState({ license: LICENSES.proWithoutPolls }));

    await openCounters(user);

    expect(screen.getByRole('button', { name: 'Neues Element' })).toBeTruthy();
    const diagnosis = screen.getByRole('note', { name: 'Pro-Funktionen fehlen' });
    expect(within(diagnosis).getByText(/Abstimmungen mit bis zu sechs Optionen/)).toBeTruthy();

    await user.click(within(diagnosis).getByRole('button', { name: 'Lizenzstatus aktualisieren' }));
    expect(actions.refreshLicense).toHaveBeenCalledTimes(1);
  });
});
