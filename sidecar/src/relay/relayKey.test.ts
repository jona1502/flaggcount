import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isRelayKey } from './relayChannel';
import { RELAY_KEY_FILE, loadOrCreateRelayKey } from './relayKey';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'flagcount-relay-'));
  directories.push(directory);
  return directory;
}

describe('loadOrCreateRelayKey', () => {
  it('creates a key once and reuses it afterwards', async () => {
    const dataDir = join(tempDir(), 'nested');

    const first = await loadOrCreateRelayKey(dataDir);
    const second = await loadOrCreateRelayKey(dataDir);

    expect(isRelayKey(first)).toBe(true);
    expect(second).toBe(first);
    expect(readFileSync(join(dataDir, RELAY_KEY_FILE), 'utf8')).toBe(first);
  });

  it('replaces a damaged key file', async () => {
    const dataDir = tempDir();
    writeFileSync(join(dataDir, RELAY_KEY_FILE), 'not-a-key');

    expect(isRelayKey(await loadOrCreateRelayKey(dataDir))).toBe(true);
  });
});
