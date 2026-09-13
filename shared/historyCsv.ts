import type { RoundRecord } from './history';

const neutralize = (value: string): string => /^[=+\-@]/.test(value) ? `'${value}` : value;
const cell = (value: unknown): string => `"${neutralize(String(value ?? '')).replace(/"/g, '""')}"`;

export function historyCsv(records: readonly RoundRecord[]): string {
  const rows = [['Runden-ID', 'Profil', 'Zähler', 'Modus', 'Beginn', 'Ende', 'Grund', 'Ziel', 'Ziel erreicht', 'Stimmen', 'Manuelle Stimmen', 'Optionen']];
  for (const record of records) rows.push([
    record.id, record.profileName, record.counterName, record.mode, record.startedAt, record.endedAt, record.endReason,
    record.target ?? '', record.targetReached ? 'ja' : 'nein', record.totalCount, record.manualVotes,
    record.options.map((option) => `${option.label}: ${option.count}`).join(' | ')
  ].map(String));
  return `\uFEFF${rows.map((row) => row.map(cell).join(';')).join('\r\n')}\r\n`;
}
