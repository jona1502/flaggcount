import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DEFAULT_OVERLAY_SETTINGS, type Settings } from '../../../shared/settings';
import { DEFAULT_TARGET, isValidTarget } from '../../../shared/voting';
import { parseOverlaySettings } from '../protocol';
import { normalizeUsername } from '../tiktok/username';

/** Keeps every valid field and falls back to the default for the rest, like the desktop app. */
export function parseSettings(value: unknown): Settings {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const username = typeof record['username'] === 'string' ? normalizeUsername(record['username']) : null;
  const target = record['target'];

  return {
    username: username ?? '',
    target: typeof target === 'number' && isValidTarget(target) ? target : DEFAULT_TARGET,
    overlay: parseOverlaySettings(record['overlay']) ?? { ...DEFAULT_OVERLAY_SETTINGS },
    telemetryEnabled: record['telemetryEnabled'] === true
  };
}

/** Persists the settings of the web version as JSON. Votes are never stored. */
export class SettingsStore {
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async load(): Promise<Settings> {
    let content: string;
    try {
      content = await readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return parseSettings(null);
      }
      throw error;
    }

    try {
      return parseSettings(JSON.parse(content));
    } catch {
      // A damaged file must not keep the server from starting.
      return parseSettings(null);
    }
  }

  /** Writes one after another and atomically, so a crash never leaves a half-written file. */
  save(settings: Settings): Promise<void> {
    const content = `${JSON.stringify(settings, null, 2)}\n`;
    const write = async (): Promise<void> => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      await writeFile(temporary, content, 'utf8');
      await rename(temporary, this.path);
    };
    this.pending = this.pending.then(write, write);
    return this.pending;
  }
}
