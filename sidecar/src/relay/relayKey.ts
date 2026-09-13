import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isRelayKey } from './relayChannel';

export const RELAY_KEY_FILE = 'overlay-relay-key';

/**
 * Loads this installation's secret relay key and creates it on first use, so the online
 * overlay URL stays the same across app starts and updates.
 */
export async function loadOrCreateRelayKey(dataDir: string): Promise<string> {
  const path = join(dataDir, RELAY_KEY_FILE);
  try {
    const stored = (await readFile(path, 'utf8')).trim();
    if (isRelayKey(stored)) {
      return stored;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const key = randomBytes(32).toString('base64url');
  await mkdir(dataDir, { recursive: true });
  await writeFile(path, key, { mode: 0o600 });
  return key;
}
