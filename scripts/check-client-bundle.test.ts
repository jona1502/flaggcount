import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error The build script is plain JavaScript without type declarations.
import { checkDirectory, findSecrets } from './check-client-bundle.mjs';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('client bundle secret check', () => {
  it('recognizes secret shapes', () => {
    expect(findSecrets('const key = "sk_live_51AbCdEfGhIjKlMnOp";')).toEqual(['Stripe secret key']);
    expect(findSecrets('whsec_0123456789abcdefghij')).toEqual(['Stripe webhook secret']);
    expect(findSecrets('-----BEGIN PRIVATE KEY-----')).toEqual(['private key']);
    expect(findSecrets('postgres://flagcount:geheim@db:5432/flagcount')).toEqual(['database URL with credentials']);
    expect(findSecrets('Checkout über https://checkout.stripe.com, Preis price_1Abc, pk_live_51abcdefghijk')).toEqual([]);
  });

  it('finds the actual values of server-only variables', () => {
    expect(findSecrets('x="correct-horse-battery"', { DASHBOARD_PASSWORD: 'correct-horse-battery' })).toEqual(['value of DASHBOARD_PASSWORD']);
    expect(findSecrets('x="short"', { DASHBOARD_PASSWORD: 'short' })).toEqual([]);
  });

  it('scans a build directory recursively', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'flagcount-bundle-'));
    directories.push(directory);
    mkdirSync(join(directory, 'chunks'));
    writeFileSync(join(directory, 'chunks', 'clean.js'), 'console.log("FlagCount")');
    writeFileSync(join(directory, 'chunks', 'leak.js'), 'fetch("/api", { headers: { a: "rk_test_51AbCdEfGhIjKlMnOp" } })');

    const problems: string[] = await checkDirectory(directory, {});

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/leak\.js: Stripe secret key$/);
  });
});
