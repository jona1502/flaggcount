import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { MAX_HISTORY_RECORDS, trimHistory, type RoundRecord } from '../../shared/history';

export class RoundHistoryStore {
  private records: RoundRecord[] = [];
  private pending: Promise<void> = Promise.resolve();
  constructor(private readonly path: string, private readonly limit = MAX_HISTORY_RECORDS) {}

  async load(): Promise<RoundRecord[]> {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8')) as unknown;
      this.records = Array.isArray(value) ? trimHistory(value.filter(isRoundRecord), this.limit) : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return this.getAll();
  }
  getAll(): RoundRecord[] { return structuredClone(this.records); }
  append(record: RoundRecord): Promise<void> { this.records = trimHistory([...this.records, record], this.limit); return this.save(); }
  replace(records: RoundRecord[]): Promise<void> { this.records = trimHistory(records, this.limit); return this.save(); }
  clear(): Promise<void> { this.records = []; return this.save(); }
  private save(): Promise<void> {
    const content = `${JSON.stringify(this.records, null, 2)}\n`;
    const write = async () => { await mkdir(dirname(this.path), { recursive: true }); const temporary = `${this.path}.tmp`; await writeFile(temporary, content, 'utf8'); await rename(temporary, this.path); };
    this.pending = this.pending.then(write, write); return this.pending;
  }
}

function isRoundRecord(value: unknown): value is RoundRecord {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<RoundRecord>;
  return item.schemaVersion === 1 && typeof item.id === 'string' && typeof item.counterId === 'string' && typeof item.totalCount === 'number' && Array.isArray(item.options);
}
