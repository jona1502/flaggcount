import type { CSSProperties } from 'react';
import type { RoundRecord } from '../../shared/history';
import { Dialog } from '../components/ui';
import { COUNTER_TYPE_LABELS } from '../counters/counterText';
import { END_REASON_LABELS, roundDuration } from './historySummary';

const numberFormat = new Intl.NumberFormat('de-DE');
const percentFormat = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 0 });
const dateTimeFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '–' : dateTimeFormat.format(date);
}

/** Everything stored about one round: aggregated counts only, never viewers or chat messages. */
export function HistoryDetails({ record, onClose }: { record: RoundRecord | null; onClose: () => void }): React.JSX.Element | null {
  if (!record) return null;
  const leader = Math.max(0, ...record.options.map((option) => option.count));

  return (
    <Dialog
      open
      variant="drawer"
      title={record.counterName}
      description={`${COUNTER_TYPE_LABELS[record.mode]} · Profil „${record.profileName}“`}
      onClose={onClose}
    >
      <div className="history-details">
        <dl className="detail-list">
          <div>
            <dt>Begonnen</dt>
            <dd>{formatDateTime(record.startedAt)}</dd>
          </div>
          <div>
            <dt>Beendet</dt>
            <dd>{formatDateTime(record.endedAt)}</dd>
          </div>
          <div>
            <dt>Dauer</dt>
            <dd>{roundDuration(record)}</dd>
          </div>
          <div>
            <dt>Grund</dt>
            <dd>{END_REASON_LABELS[record.endReason]}</dd>
          </div>
          <div>
            <dt>Stimmen</dt>
            <dd>{numberFormat.format(record.totalCount)}</dd>
          </div>
          <div>
            <dt>Ziel</dt>
            <dd>
              {record.target === null
                ? 'Ohne Ziel'
                : `${numberFormat.format(record.target)} – ${record.targetReached ? 'erreicht' : 'nicht erreicht'}`}
            </dd>
          </div>
          <div>
            <dt>Manuelle Korrekturen</dt>
            <dd>{numberFormat.format(record.manualVotes)}</dd>
          </div>
        </dl>

        <h3 className="details-heading">{record.mode === 'poll' ? 'Ergebnis' : 'Stimmen'}</h3>
        <ul className="history-options" aria-label="Ergebnis je Option">
          {record.options.map((option) => {
            const share = record.totalCount > 0 ? option.count / record.totalCount : 0;
            return (
              <li key={option.optionId} data-leading={record.mode === 'poll' && leader > 0 && option.count === leader}>
                <div className="history-option-head">
                  <span>{option.label}</span>
                  <span>
                    {numberFormat.format(option.count)} · {percentFormat.format(share)}
                  </span>
                </div>
                <div className="live-option-bar" aria-hidden="true" style={{ '--option-color': 'var(--fc-accent)' } as CSSProperties}>
                  <div style={{ width: `${Math.round(share * 100)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="details-hint">Gespeichert sind nur zusammengefasste Ergebnisse – keine Zuschauernamen und keine Chatnachrichten.</p>
      </div>
    </Dialog>
  );
}
