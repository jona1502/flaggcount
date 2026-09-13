import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createDefaultSettings, parseSettings, type Settings, type SettingsMigration } from '../../../shared/profiles';
import { normalizeUsername } from '../tiktok/username';

/** Copy of the 0.2 settings file, written once before it is migrated. */
export const SETTINGS_V1_BACKUP_FILE = 'settings.v1.backup.json';
/** Copy of a settings file that could not be read, written before it is replaced. */
export const SETTINGS_INVALID_BACKUP_FILE = 'settings.invalid.backup.json';

const now = (): string => new Date().toISOString();

/** Reads settings of any version, like the desktop app, and applies the TikTok username rules. */
export function loadSettingsDocument(value: unknown, timestamp: string): { settings: Settings; migration: SettingsMigration } {
  const { settings, migration } = parseSettings(value, timestamp);
  return { settings: { ...settings, username: normalizeUsername(settings.username) ?? '' }, migration };
}

/** Persists the settings of the web version as JSON. Votes are never stored. */
export class SettingsStore {
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly clock: () => string = now
  ) {}

  /**
   * Migrates older or damaged files after copying them next to the settings. If the copy fails, the
   * original stays untouched and loading fails, so nothing is ever lost silently.
   */
  async load(): Promise<Settings> {
    let content: string;
    try {
      content = await readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return createDefaultSettings(this.clock());
      }
      throw error;
    }

    let stored: unknown;
    try {
      stored = JSON.parse(content);
    } catch {
      // Unreadable JSON is treated like a damaged current document.
      stored = { schemaVersion: null };
    }

    const { settings, migration } = loadSettingsDocument(stored, this.clock());
    if (migration !== 'none') {
      const backup = migration === 'from-v1' ? SETTINGS_V1_BACKUP_FILE : SETTINGS_INVALID_BACKUP_FILE;
      // The first 0.2 backup is the original; later damaged files overwrite their own backup.
      await copyFile(this.path, join(dirname(this.path), backup), migration === 'from-v1' ? 1 : 0).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== 'EEXIST') throw error;
        }
      );
      await this.save(settings);
    }
    return settings;
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
