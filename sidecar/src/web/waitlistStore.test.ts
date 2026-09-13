import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WaitlistStore, normalizeEmail } from './waitlistStore';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function createStore() {
  const directory = await mkdtemp(join(tmpdir(), 'flagcount-waitlist-'));
  directories.push(directory);
  const path = join(directory, 'waitlist.json');
  return { path, store: new WaitlistStore(path, () => new Date('2026-09-13T12:00:00.000Z')) };
}

describe('WaitlistStore', () => {
  it('normalizes addresses and requires explicit consent', async () => {
    const { path, store } = await createStore();

    expect(await store.subscribe(' Person@Example.COM ', false)).toBe('consent-required');
    expect(await store.subscribe(' Person@Example.COM ', true)).toBe('ok');
    expect(await store.subscribe('person@example.com', true)).toBe('ok');

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual([
      { email: 'person@example.com', consentedAt: '2026-09-13T12:00:00.000Z' }
    ]);
  });

  it('unsubscribes idempotently without revealing membership', async () => {
    const { path, store } = await createStore();
    await store.subscribe('person@example.com', true);

    expect(await store.unsubscribe('person@example.com')).toBe('ok');
    expect(await store.unsubscribe('person@example.com')).toBe('ok');
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual([]);
  });

  it.each(['', 'person', '@example.com', 'person @example.com', 'x'.repeat(255)])('rejects %j', (email) => {
    expect(normalizeEmail(email)).toBeNull();
  });
});
