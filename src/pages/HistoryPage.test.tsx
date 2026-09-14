// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppState } from '../../shared/appState';
import { FEATURES } from '../../shared/entitlements';
import { Dashboard } from '../dashboard/Dashboard';
import { LICENSES, createActions, createAppState, historyRound } from '../test/appStateFixtures';

afterEach(cleanup);

const history = [
  historyRound(),
  historyRound({
    id: 'round-2',
    profileId: 'quiz',
    profileName: 'Quiz-Abend',
    counterName: 'Team-Wahl',
    mode: 'poll',
    endedAt: '2026-09-11T20:00:00.000Z',
    target: null,
    targetReached: false,
    totalCount: 4,
    manualVotes: 0,
    options: [
      { optionId: 'red', label: 'Rot', count: 3 },
      { optionId: 'blue', label: 'Blau', count: 1 }
    ]
  })
];

async function renderHistory(state: AppState, actions = createActions()) {
  const element = (next: AppState) => (
    <Dashboard state={next} error={null} pending={false} actions={actions} onDismissError={() => undefined} onCopyText={async () => undefined} proAvailable />
  );
  const view = render(element(state));
  const user = userEvent.setup();
  await user.click(within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getByRole('button', { name: 'Historie' }));
  return { actions, user, rerender: (next: AppState) => act(() => view.rerender(element(next))) };
}

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const toasts = () => screen.getByRole('region', { name: 'Benachrichtigungen' }).textContent;

describe('Historie', () => {
  it('explains the Pro history on Free instead of an empty page', async () => {
    const { user } = await renderHistory(createAppState({ history }));

    expect(screen.getByRole('heading', { name: 'Rundenhistorie mit FlagCount Pro' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Pro ansehen' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Lizenz & Konto');
  });

  it('diagnoses a Pro license without the history feature', async () => {
    const license = { ...LICENSES.pro, features: FEATURES.filter((feature) => feature !== 'history') };
    const { actions, user } = await renderHistory(createAppState({ license, history }));

    const note = screen.getByRole('note', { name: 'Die Historie ist in deiner Lizenz nicht freigegeben' });
    await user.click(within(note).getByRole('button', { name: 'Lizenzstatus aktualisieren' }));
    expect(actions.refreshLicense).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Pro ansehen' })).toBeNull();
  });

  it('explains when rounds appear while the history is empty', async () => {
    await renderHistory(createAppState({ license: LICENSES.pro, history: [] }));

    expect(screen.getByRole('heading', { name: 'Noch keine abgeschlossene Runde' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'CSV exportieren' })).toBeNull();
  });

  it('summarizes, lists the newest rounds first, filters and shows details', async () => {
    const { user } = await renderHistory(createAppState({ license: LICENSES.pro, history }));

    const stats = screen.getByRole('region', { name: 'Kennzahlen' });
    expect(stats.textContent).toContain('Runden2');
    expect(stats.textContent).toContain('Stimmen16');
    expect(rows().map((row) => within(row).getAllByRole('cell')[2]?.textContent)).toEqual(['Team-WahlAbstimmung', 'Rote FlaggenEinfacher Zähler']);

    await user.selectOptions(screen.getByLabelText('Profil'), 'quiz');
    expect(rows()).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Kennzahlen der Auswahl' }).textContent).toContain('Runden1');
    await user.type(screen.getByLabelText('Historie filtern'), 'flaggen');
    expect(screen.getByRole('heading', { name: 'Keine Runde passt zum Filter' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));
    expect(rows()).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: /^Details zu Team-Wahl/ }));
    const details = screen.getByRole('dialog', { name: 'Team-Wahl' });
    expect(within(details).getByText('3 · 75 %')).toBeTruthy();
    expect(within(details).getByText('Ohne Ziel')).toBeTruthy();
    expect(details.textContent).toContain('keine Zuschauernamen');
  });

  it('exports CSV with feedback and reports a failed export', async () => {
    const actions = createActions();
    const { user } = await renderHistory(createAppState({ license: LICENSES.pro, history }), actions);

    await user.click(screen.getByRole('button', { name: 'CSV exportieren' }));
    const [csv] = actions.exportHistoryCsv.mock.calls[0] as unknown as [string];
    expect(csv.indexOf('Rote Flaggen')).toBeLessThan(csv.indexOf('Team-Wahl'));
    expect(toasts()).toContain('CSV exportiert');
    expect(toasts()).toContain('history.csv');

    actions.exportHistoryCsv.mockRejectedValueOnce(new Error('disk full'));
    await user.click(screen.getByRole('button', { name: 'CSV exportieren' }));
    expect(toasts()).toContain('Export fehlgeschlagen');
  });

  it('marks CSV export as unavailable when the Pro license does not include it', async () => {
    const license = { ...LICENSES.pro, features: FEATURES.filter((feature) => feature !== 'csv-export') };
    await renderHistory(createAppState({ license, history }));

    expect(screen.queryByRole('button', { name: 'CSV exportieren' })).toBeNull();
    expect(screen.getByText('CSV-Export nicht freigegeben')).toBeTruthy();
  });

  it('clears the history only after confirmation and confirms it afterwards', async () => {
    const state = createAppState({ license: LICENSES.pro, history });
    const { actions, user, rerender } = await renderHistory(state);

    await user.click(screen.getByRole('button', { name: 'Historie löschen' }));
    const dialog = screen.getByRole('dialog', { name: 'Gesamte Historie löschen?' });
    expect(dialog.textContent).toContain('Alle 2 gespeicherten Runden');
    await user.click(within(dialog).getByRole('button', { name: 'Ja, Historie löschen' }));
    expect(actions.clearHistory).toHaveBeenCalledTimes(1);

    rerender({ ...state, history: [] });
    expect(toasts()).toContain('Historie gelöscht');
  });
});
