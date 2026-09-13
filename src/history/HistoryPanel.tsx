import type { RoundRecord } from '../../shared/history';
import { useState } from 'react';
import { historyCsv } from '../../shared/historyCsv';

export function HistoryPanel({ records, available, exportAvailable, disabled, onClear, onExport }: { records: RoundRecord[]; available: boolean; exportAvailable: boolean; disabled: boolean; onClear: () => void; onExport: (csv: string) => Promise<string> }): React.JSX.Element {
  const [filter, setFilter] = useState('');
  const [exportedTo, setExportedTo] = useState<string | null>(null);
  if (!available) return <section className="panel"><h2>Historie <span className="pro-tag">Pro</span></h2><p className="hint">Speichere bis zu 500 abgeschlossene Runden ausschließlich lokal.</p></section>;
  return <section className="panel" aria-labelledby="history-heading">
    <div className="panel-heading"><h2 id="history-heading">Rundenhistorie</h2><div>{exportAvailable && <button type="button" className="button secondary" disabled={disabled || records.length === 0} onClick={() => void onExport(historyCsv(records)).then(setExportedTo)}>CSV exportieren</button>} <button type="button" className="button secondary" disabled={disabled || records.length === 0} onClick={() => { if (window.confirm('Gesamte lokale Historie wirklich löschen?')) onClear(); }}>Historie löschen</button></div></div>
    {exportedTo && <p className="hint" role="status">Export gespeichert: {exportedTo}</p>}
    {records.length > 0 && <div><label htmlFor="history-filter">Historie filtern</label><input id="history-filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Profil oder Zähler" /></div>}
    {records.length === 0 ? <p className="hint">Noch keine abgeschlossene Runde mit Stimmen.</p> : <div className="table-scroll"><table><thead><tr><th>Ende</th><th>Profil</th><th>Zähler</th><th>Grund</th><th>Stimmen</th><th>Ziel</th></tr></thead><tbody>{[...records].reverse().filter((record) => `${record.profileName} ${record.counterName}`.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())).map((record) => <tr key={record.id}><td>{new Date(record.endedAt).toLocaleString('de-DE')}</td><td>{record.profileName}</td><td>{record.counterName}</td><td>{record.endReason}</td><td>{record.totalCount}</td><td>{record.targetReached ? 'erreicht' : '–'}</td></tr>)}</tbody></table></div>}
  </section>;
}
