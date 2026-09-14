import type { RoundRecord } from '../../shared/history';

export const END_REASON_LABELS: Record<RoundRecord['endReason'], string> = {
  reset: 'Zurückgesetzt',
  'profile-change': 'Profilwechsel',
  'app-exit': 'App beendet'
};

export type HistorySummary = {
  rounds: number;
  votes: number;
  targetsReached: number;
  averageVotes: number;
};

export function summarizeHistory(records: readonly RoundRecord[]): HistorySummary {
  const votes = records.reduce((sum, record) => sum + record.totalCount, 0);
  return {
    rounds: records.length,
    votes,
    targetsReached: records.filter((record) => record.targetReached).length,
    averageVotes: records.length > 0 ? Math.round(votes / records.length) : 0
  };
}

export type HistoryFilter = {
  query: string;
  /** `null` shows the rounds of every profile. */
  profileId: string | null;
};

/** Newest rounds first; the query matches profile and element names. */
export function filterHistory(records: readonly RoundRecord[], { query, profileId }: HistoryFilter): RoundRecord[] {
  const needle = query.trim().toLocaleLowerCase('de-DE');
  return [...records]
    .reverse()
    .filter(
      (record) =>
        (profileId === null || record.profileId === profileId) &&
        (needle === '' || `${record.profileName} ${record.counterName}`.toLocaleLowerCase('de-DE').includes(needle))
    );
}

/** Profiles that appear in the history, named as in their latest round. */
export function historyProfiles(records: readonly RoundRecord[]): { id: string; name: string }[] {
  const names = new Map<string, string>();
  for (const record of records) names.set(record.profileId, record.profileName);
  return [...names].map(([id, name]) => ({ id, name }));
}

export function roundDuration(record: RoundRecord): string {
  const seconds = Math.max(0, Math.round((Date.parse(record.endedAt) - Date.parse(record.startedAt)) / 1000));
  if (Number.isNaN(seconds)) return '–';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min ${rest} s`;
  return `${rest} s`;
}
