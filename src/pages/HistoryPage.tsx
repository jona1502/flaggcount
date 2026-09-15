import { useEffect, useRef, useState } from 'react';
import { canUse } from '../../shared/entitlements';
import type { RoundRecord } from '../../shared/history';
import { historyCsv } from '../../shared/historyCsv';
import { PageHeader } from '../app-shell/PageHeader';
import {
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  EmptyState,
  Field,
  IconDownload,
  IconHistory,
  IconLive,
  IconLock,
  IconRefresh,
  IconTrash,
  Input,
  Select,
  useToast
} from '../components/ui';
import { COUNTER_TYPE_LABELS } from '../counters/counterText';
import { HistoryDetails, formatDateTime } from '../history/HistoryDetails';
import { END_REASON_LABELS, filterHistory, historyProfiles, summarizeHistory } from '../history/historySummary';
import type { PageProps } from './types';

const numberFormat = new Intl.NumberFormat('de-DE');

/** Finished rounds with filters, details and CSV export. Stored only on this computer. */
export function HistoryPage({ model, pending, error, actions, navigate }: PageProps): React.JSX.Element {
  const { state, entitlements, isPro } = model;
  const records = state.history ?? [];
  const available = canUse(entitlements, 'history');
  const exportAvailable = canUse(entitlements, 'csv-export');
  const [query, setQuery] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [selected, setSelected] = useState<RoundRecord | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [exporting, setExporting] = useState(false);
  const clearing = useRef(false);
  const toast = useToast();

  // Clearing is confirmed once the backend reports an empty history.
  useEffect(() => {
    if (clearing.current && records.length === 0) {
      clearing.current = false;
      toast({ title: 'Historie gelöscht' });
    }
  }, [records.length, toast]);
  useEffect(() => {
    if (error) clearing.current = false;
  }, [error]);

  const header = (actionsSlot?: React.ReactNode) => (
    <PageHeader title="Historie" description="Abgeschlossene Runden, gespeichert nur auf diesem Computer." actions={actionsSlot} />
  );

  if (!available) {
    return (
      <div className="page history-page">
        {header()}
        {isPro ? (
          <Callout
            tone="warning"
            title="Die Historie ist in deiner Lizenz nicht freigegeben"
            actions={
              <Button size="sm" icon={IconRefresh} loading={pending} onClick={() => void actions.refreshLicense()}>
                Lizenzstatus aktualisieren
              </Button>
            }
          >
            Deine Lizenz meldet Audience Live Pro, enthält die Rundenhistorie aber gerade nicht. Aktualisiere den Lizenzstatus.
          </Callout>
        ) : (
          <EmptyState
            icon={IconLock}
            title="Rundenhistorie mit Audience Live Pro"
            description="Speichere bis zu 500 abgeschlossene Runden ausschließlich lokal: Ergebnisse, Ziele und Abstimmungen – ohne Zuschauernamen oder Chatnachrichten. Mit CSV-Export für Excel."
            action={
              <Button variant="primary" onClick={() => navigate({ page: 'license' })}>
                Pro ansehen
              </Button>
            }
          />
        )}
      </div>
    );
  }

  const visible = filterHistory(records, { query, profileId });
  const summary = summarizeHistory(visible);
  const profiles = historyProfiles(records);
  const filtered = query.trim() !== '' || profileId !== null;

  const exportCsv = async (): Promise<void> => {
    setExporting(true);
    try {
      // The file lists rounds in the order they happened.
      const path = await actions.exportHistoryCsv(historyCsv([...visible].reverse()));
      toast({ title: 'CSV exportiert', description: path ? `Gespeichert unter ${path}` : undefined });
    } catch {
      toast({ tone: 'danger', title: 'Export fehlgeschlagen', description: 'Die Datei konnte nicht gespeichert werden. Bitte versuche es erneut.' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page history-page">
      {header(
        records.length > 0 && (
          <>
            {exportAvailable ? (
              <Button icon={IconDownload} loading={exporting} disabled={pending || visible.length === 0} onClick={() => void exportCsv()}>
                {filtered ? 'Auswahl als CSV exportieren' : 'CSV exportieren'}
              </Button>
            ) : (
              <Badge tone={isPro ? 'warning' : 'pro'}>{isPro ? 'CSV-Export nicht freigegeben' : 'CSV-Export mit Pro'}</Badge>
            )}
            <Button variant="danger-outline" icon={IconTrash} disabled={pending} onClick={() => setConfirmClear(true)}>
              Historie löschen
            </Button>
          </>
        )
      )}

      {records.length === 0 ? (
        <EmptyState
          icon={IconHistory}
          title="Noch keine abgeschlossene Runde"
            description="Eine Runde landet hier, sobald du sie zurücksetzt, das Profil wechselst oder Audience Live beendest – vorausgesetzt, sie hatte mindestens eine Stimme."
          action={
            <Button icon={IconLive} onClick={() => navigate({ page: 'live' })}>
              Zur Übersicht
            </Button>
          }
        />
      ) : (
        <>
          <section aria-label={filtered ? 'Kennzahlen der Auswahl' : 'Kennzahlen'}>
          <dl className="history-stats">
            <div>
              <dt>Runden</dt>
              <dd>{numberFormat.format(summary.rounds)}</dd>
            </div>
            <div>
              <dt>Stimmen</dt>
              <dd>{numberFormat.format(summary.votes)}</dd>
            </div>
            <div>
              <dt>Ziele erreicht</dt>
              <dd>{numberFormat.format(summary.targetsReached)}</dd>
            </div>
            <div>
              <dt>Ø Stimmen pro Runde</dt>
              <dd>{numberFormat.format(summary.averageVotes)}</dd>
            </div>
          </dl>
          </section>

          <div className="history-toolbar">
            <Field id="history-filter" label="Historie filtern">
              <Input type="search" value={query} placeholder="Profil oder Element" onChange={(event) => setQuery(event.target.value)} />
            </Field>
            {profiles.length > 1 && (
              <Field id="history-profile" label="Profil">
                <Select value={profileId ?? ''} onChange={(event) => setProfileId(event.target.value || null)}>
                  <option value="">Alle Profile</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              title="Keine Runde passt zum Filter"
              description="Ändere den Suchbegriff oder zeige wieder alle Profile an."
              action={
                <Button
                  onClick={() => {
                    setQuery('');
                    setProfileId(null);
                  }}
                >
                  Filter zurücksetzen
                </Button>
              }
            />
          ) : (
            <div className="table-scroll history-table-wrap">
              <table className="history-table">
                <caption className="visually-hidden">Abgeschlossene Runden, neueste zuerst</caption>
                <thead>
                  <tr>
                    <th scope="col">Ende</th>
                    <th scope="col">Profil</th>
                    <th scope="col">Element</th>
                    <th scope="col">Grund</th>
                    <th scope="col" className="is-number">
                      Stimmen
                    </th>
                    <th scope="col">Ziel</th>
                    <th scope="col">
                      <span className="visually-hidden">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((record) => {
                    const ended = formatDateTime(record.endedAt);
                    return (
                      <tr key={record.id}>
                        <td>{ended}</td>
                        <td>{record.profileName}</td>
                        <td>
                          <span className="history-element">{record.counterName}</span>
                          <span className="history-mode">{COUNTER_TYPE_LABELS[record.mode]}</span>
                        </td>
                        <td>{END_REASON_LABELS[record.endReason]}</td>
                        <td className="is-number">{numberFormat.format(record.totalCount)}</td>
                        <td>
                          {record.target === null ? (
                            '–'
                          ) : record.targetReached ? (
                            <Badge tone="success">erreicht</Badge>
                          ) : (
                            numberFormat.format(record.target)
                          )}
                        </td>
                        <td>
                          <Button size="sm" variant="ghost" aria-label={`Details zu ${record.counterName}, beendet ${ended}`} onClick={() => setSelected(record)}>
                            Details
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="history-privacy">Gespeichert sind nur zusammengefasste Ergebnisse – keine Zuschauernamen und keine Chatnachrichten.</p>
        </>
      )}

      <HistoryDetails record={selected} onClose={() => setSelected(null)} />
      <ConfirmDialog
        open={confirmClear}
        title="Gesamte Historie löschen?"
        message={`Alle ${numberFormat.format(records.length)} gespeicherten Runden werden von diesem Computer gelöscht. Das lässt sich nicht rückgängig machen.`}
        confirmLabel="Ja, Historie löschen"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          clearing.current = true;
          void actions.clearHistory();
        }}
      />
    </div>
  );
}
