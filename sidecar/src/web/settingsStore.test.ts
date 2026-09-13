import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultSettings, primaryCounter } from '../../../shared/profiles';
import { DEFAULT_OVERLAY_SETTINGS } from '../../../shared/settings';
import { SETTINGS_INVALID_BACKUP_FILE, SETTINGS_V1_BACKUP_FILE, SettingsStore } from './settingsStore';

const NOW = '2026-09-13T21:30:00.000Z';
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'flagcount-settings-'));
  directories.push(directory);
  return directory;
}

describe('SettingsStore', () => {
  it('returns defaults without writing when there is no file yet', async () => {
    const directory = tempDir();
    const path = join(directory, 'settings.json');

    expect(await new SettingsStore(path, () => NOW).load()).toEqual(createDefaultSettings(NOW));
    expect(existsSync(path)).toBe(false);
  });

  it('backs up and migrates 0.2 settings exactly once', async () => {
    const directory = tempDir();
    const path = join(directory, 'settings.json');
    const original = JSON.stringify({ username: '@Streamer', target: 42, overlay: { ...DEFAULT_OVERLAY_SETTINGS, size: 50 } });
    writeFileSync(path, original);

    const settings = await new SettingsStore(path, () => NOW).load();

    expect(settings.username).toBe('streamer');
    expect(primaryCounter(settings)).toMatchObject({ target: 42, overlay: { size: 50 } });
    expect(readFileSync(join(directory, SETTINGS_V1_BACKUP_FILE), 'utf8')).toBe(original);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(settings);

    const reloaded = await new SettingsStore(path, () => '2030-01-01T00:00:00.000Z').load();
    expect(reloaded).toEqual(settings);
    expect(readFileSync(join(directory, SETTINGS_V1_BACKUP_FILE), 'utf8')).toBe(original);
  });

  it('keeps the first 0.2 backup if one already exists', async () => {
    const directory = tempDir();
    const path = join(directory, 'settings.json');
    writeFileSync(join(directory, SETTINGS_V1_BACKUP_FILE), 'original');
    writeFileSync(path, JSON.stringify({ target: 5 }));

    await new SettingsStore(path, () => NOW).load();

    expect(readFileSync(join(directory, SETTINGS_V1_BACKUP_FILE), 'utf8')).toBe('original');
  });

  it('backs up a damaged file before replacing it', async () => {
    const directory = tempDir();
    const path = join(directory, 'settings.json');
    writeFileSync(path, '{ not json');

    const settings = await new SettingsStore(path, () => NOW).load();

    expect(settings).toEqual(createDefaultSettings(NOW));
    expect(readFileSync(join(directory, SETTINGS_INVALID_BACKUP_FILE), 'utf8')).toBe('{ not json');
  });
});
