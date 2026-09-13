import { describe, expect, it } from 'vitest';
import { generateSigningKeyPair } from '../../license/signature';
import { readLicensingConfig } from './licensingConfig';

const KEY = Buffer.from(generateSigningKeyPair().privateKeyPem).toString('base64');

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    DATABASE_URL: 'postgres://flagcount:secret@db:5432/flagcount',
    LICENSE_SIGNING_PRIVATE_KEY: KEY,
    LICENSE_SIGNING_KEY_ID: '2026-09',
    LICENSE_CODE_PEPPER: 'p'.repeat(32),
    SUPPORT_EMAIL: 'support@example.com',
    PADDLE_ENVIRONMENT: 'sandbox',
    PADDLE_API_KEY: 'pdl_sdbx_apikey_0123456789',
    PADDLE_WEBHOOK_SECRET: 'pdl_ntfset_secret',
    PADDLE_PRICE_YEARLY: 'pri_01h1vjg3ycsxz0ptvwvzsbq4c9',
    SMTP_URL: 'smtps://user:password@mail.example.com:465',
    MAIL_FROM: 'FlagCount <pro@example.com>',
    ...overrides
  };
}

describe('readLicensingConfig', () => {
  it('stays disabled without any billing variable', () => {
    expect(readLicensingConfig({ DASHBOARD_PASSWORD: 'x' })).toEqual({ kind: 'disabled' });
  });

  it('reads a complete sandbox configuration', () => {
    const result = readLicensingConfig(env({ PADDLE_CHECKOUT_URL: 'https://flagcount.example/pro/kaufen' }));

    expect(result.kind).toBe('enabled');
    if (result.kind !== 'enabled') return;
    expect(result.settings.signingPrivateKeyPem).toContain('BEGIN PRIVATE KEY');
    expect(result.settings.mail).toEqual({ kind: 'smtp', url: 'smtps://user:password@mail.example.com:465', from: 'FlagCount <pro@example.com>' });
    expect(result.settings.paddle).toEqual({
      environment: 'sandbox',
      apiKey: 'pdl_sdbx_apikey_0123456789',
      webhookSecret: 'pdl_ntfset_secret',
      prices: { yearly: 'pri_01h1vjg3ycsxz0ptvwvzsbq4c9' },
      checkoutUrl: 'https://flagcount.example/pro/kaufen'
    });
  });

  it('keeps sandbox and live keys apart', () => {
    expect(readLicensingConfig(env({ PADDLE_ENVIRONMENT: 'production' }))).toEqual({
      kind: 'invalid',
      problems: ['PADDLE_API_KEY is not a live key']
    });
    expect(readLicensingConfig(env({ PADDLE_API_KEY: 'pdl_live_apikey_0123456789' }))).toEqual({
      kind: 'invalid',
      problems: ['PADDLE_API_KEY is not a sandbox key']
    });
  });

  it('allows the mail outbox file only in the sandbox', () => {
    const outbox = { SMTP_URL: undefined, MAIL_FROM: undefined, MAIL_OUTBOX_FILE: 'data/mail-outbox.jsonl' };

    expect(readLicensingConfig(env(outbox)).kind).toBe('enabled');
    expect(
      readLicensingConfig(env({ ...outbox, PADDLE_ENVIRONMENT: 'production', PADDLE_API_KEY: 'pdl_live_apikey_0123456789' }))
    ).toMatchObject({ kind: 'invalid', problems: ['MAIL_OUTBOX_FILE is only allowed with PADDLE_ENVIRONMENT=sandbox'] });
  });

  it('names every missing or invalid variable without revealing values', () => {
    const result = readLicensingConfig({
      PADDLE_API_KEY: 'pdl_sdbx_apikey_0123456789',
      LICENSE_CODE_PEPPER: 'short',
      LICENSE_SIGNING_PRIVATE_KEY: 'bm90IGEga2V5',
      PADDLE_PRICE_MONTHLY: 'monthly'
    });

    expect(result).toEqual({
      kind: 'invalid',
      problems: [
        'DATABASE_URL is missing',
        'LICENSE_SIGNING_KEY_ID is missing',
        'SUPPORT_EMAIL is missing',
        'PADDLE_ENVIRONMENT is missing',
        'PADDLE_WEBHOOK_SECRET is missing',
        'LICENSE_CODE_PEPPER must be at least 32 characters',
        'LICENSE_SIGNING_PRIVATE_KEY must be a base64-encoded Ed25519 PKCS#8 PEM key',
        'PADDLE_PRICE_MONTHLY is not a Paddle price id',
        'PADDLE_PRICE_MONTHLY or PADDLE_PRICE_YEARLY is missing',
        'SMTP_URL is missing'
      ]
    });
    expect(JSON.stringify(result)).not.toContain('pdl_sdbx_apikey');
  });
});
