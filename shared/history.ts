import type { CounterMode } from './profiles';

export type RoundRecord = {
  schemaVersion: 1;
  id: string;
  profileId: string;
  profileName: string;
  counterId: string;
  counterName: string;
  mode: CounterMode;
  startedAt: string;
  endedAt: string;
  endReason: 'reset' | 'profile-change' | 'app-exit';
  target: number | null;
  targetReached: boolean;
  totalCount: number;
  options: Array<{ optionId: string; label: string; count: number }>;
  manualVotes: number;
};

export const MAX_HISTORY_RECORDS = 500;

export function trimHistory(records: readonly RoundRecord[], limit = MAX_HISTORY_RECORDS): RoundRecord[] {
  return records.slice(Math.max(0, records.length - limit));
}
