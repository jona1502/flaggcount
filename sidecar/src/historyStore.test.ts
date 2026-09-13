import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { RoundHistoryStore } from './historyStore';
import type { RoundRecord } from '../../shared/history';

const record = (id: string): RoundRecord => ({ schemaVersion: 1, id, profileId: 'p', profileName: 'Profil', counterId: 'c', counterName: 'Zähler', mode: 'single', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:01:00Z', endReason: 'reset', target: 10, targetReached: false, totalCount: 1, options: [{ optionId: 'o', label: 'Option', count: 1 }], manualVotes: 0 });

describe('RoundHistoryStore', () => {
  it('writes atomically and removes the oldest record', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'flagcount-history-')), 'history.json');
    const store = new RoundHistoryStore(path, 2);
    await store.append(record('1')); await store.append(record('2')); await store.append(record('3'));
    expect(store.getAll().map(({ id }) => id)).toEqual(['2', '3']);
    expect(JSON.parse(await readFile(path, 'utf8'))).toHaveLength(2);
  });
});
