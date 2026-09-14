import { describe, expect, it } from 'vitest';
import { generateSigningKeyPair } from '../../license/signature';
import { readLicensingConfig } from './licensingConfig';

const KEY = Buffer.from(generateSigningKeyPair().privateKeyPem).toString('base64');

const BASE = {
  DATABASE_URL: 'postgres://flagcount:secret@db:5432/flagcount',
  LICENSE_SIGNING_PRIVATE_KEY: KEY,
  LICENSE_SIGNING_KEY_ID: '2026-09',
  LICENSE_CODE_PEPPER: 'p'.repeat(32),
  SUPPORT_EMAIL: 'support@example.com',
  SMTP_URL: 'smtps://user:password@mail.example.com:465',
  MAIL_FROM: 'FlagCount <pro@example.com>'
};

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    ...BASE,
    PADDLE_ENVIRONMENT: 'sandbox',
    PADDLE_API_KEY: 'pdl_sdbx_apikey_0123456789',
    PADDLE_WEBHOOK_SECRET: 'pdl_ntfset_secret',
    PADDLE_PRICE_YEARLY: 'pri_01h1vjg3ycsxz0ptvwvzsbq4c9',
    ...overrides
  };
}

function stripeEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    ...BASE,
    PUBLIC_BASE_URL: 'https://flagcount.example/',
    STRIPE_SECRET_KEY: 'sk_test_51abcdefghijklmnop',
    STRIPE_WEBHOOK_SECRET: 'whsec_0123456789abcdefghij',
    STRIPE_PRICE_MONTHLY: 'price_1Monthly0123456',
    STRIPE_PRICE_YEARLY: 'price_1Yearly01234567',
    ...overrides
  };
}

const withoutGate = (problems: string[]) => problems.filter((problem) => !problem.includes('not available in this version'));

describe('readLicensingConfig', () => {
  it('stays disabled without any billing variable', () => {
    expect(readLicensingConfig({ DASHBOARD_PASSWORD: 'x' })).toEqual({ kind: 'disabled' });
  });

  it('reads a complete Paddle sandbox configuration', () => {
    const result = readLicensingConfig(env({ PADDLE_CHECKOUT_URL: 'https://flagcount.example/pro/kaufen' }));

    expect(result.kind).toBe('enabled');
    if (result.kind !== 'enabled') return;
    expect(result.settings.signingPrivateKeyPem).toContain('BEGIN PRIVATE KEY');
    expect(result.settings.mail).toEqual({ kind: 'smtp', url: 'smtps://user:password@mail.example.com:465', from: 'FlagCount <pro@example.com>' });
    expect(result.settings.billing).toEqual({
      provider: 'paddle',
      paddle: {
        environment: 'sandbox',
        apiKey: 'pdl_sdbx_apikey_0123456789',
        webhookSecret: 'pdl_ntfset_secret',
        prices: { yearly: 'pri_01h1vjg3ycsxz0ptvwvzsbq4c9' },
        checkoutUrl: 'https://flagcount.example/pro/kaufen'
      }
    });
  });

  it('keeps Paddle sandbox and live keys apart', () => {
    expect(readLicensingConfig(env({ PADDLE_ENVIRONMENT: 'production' }))).toEqual({
      kind: 'invalid',
      problems: ['PADDLE_API_KEY is not a live key']
    });
    expect(readLicensingConfig(env({ PADDLE_API_KEY: 'pdl_live_apikey_0123456789' }))).toEqual({
      kind: 'invalid',
      problems: ['PADDLE_API_KEY is not a sandbox key']
    });
  });

  it('allows the mail outbox file only while testing', () => {
    const outbox = { SMTP_URL: undefined, MAIL_FROM: undefined, MAIL_OUTBOX_FILE: 'data/mail-outbox.jsonl' };

    expect(readLicensingConfig(env(outbox)).kind).toBe('enabled');
    expect(
      readLicensingConfig(env({ ...outbox, PADDLE_ENVIRONMENT: 'production', PADDLE_API_KEY: 'pdl_live_apikey_0123456789' }))
    ).toMatchObject({ kind: 'invalid', problems: ['MAIL_OUTBOX_FILE is only allowed with PADDLE_ENVIRONMENT=sandbox'] });

    const live = readLicensingConfig(stripeEnv({ ...outbox, STRIPE_SECRET_KEY: 'rk_live_51abcdefghijklmnop' }));
    expect(live.kind === 'invalid' && withoutGate(live.problems)).toEqual(['MAIL_OUTBOX_FILE is only allowed with a Stripe test key']);
  });

  it('reads a Stripe test mode configuration', () => {
    const result = readLicensingConfig(
      stripeEnv({ STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_1Portal01234567', STRIPE_MANAGED_PAYMENTS_ENABLED: 'true' })
    );

    // Stripe stays switched off until checkout, webhooks and the portal are complete.
    expect(result).toEqual({ kind: 'invalid', problems: ['Stripe billing is not available in this version yet'] });
  });

  it('validates Stripe keys, ids and the public base URL', () => {
    const result = readLicensingConfig(
      stripeEnv({
        STRIPE_SECRET_KEY: 'pk_test_51abcdefghijklmnop',
        STRIPE_WEBHOOK_SECRET: 'secret',
        STRIPE_PRICE_MONTHLY: 'pri_01h1vjg3ycsxz0ptvwvzsbq4c9',
        STRIPE_PRICE_YEARLY: undefined,
        STRIPE_PORTAL_CONFIGURATION_ID: 'portal',
        STRIPE_MANAGED_PAYMENTS_ENABLED: 'yes',
        PUBLIC_BASE_URL: 'http://flagcount.example/pro'
      })
    );

    expect(result.kind === 'invalid' && withoutGate(result.problems)).toEqual([
      'STRIPE_SECRET_KEY is not a Stripe secret or restricted key',
      'STRIPE_WEBHOOK_SECRET is not a Stripe webhook signing secret',
      'STRIPE_PRICE_MONTHLY is not a Stripe price id',
      'STRIPE_PRICE_MONTHLY or STRIPE_PRICE_YEARLY is missing',
      'STRIPE_PORTAL_CONFIGURATION_ID is not a portal configuration id',
      'STRIPE_MANAGED_PAYMENTS_ENABLED must be true or false',
      'PUBLIC_BASE_URL must be an https origin without a path'
    ]);
    expect(JSON.stringify(result)).not.toContain('51abcdefghijklmnop');
  });

  it('accepts a local http base URL only in Stripe test mode', () => {
    const local = { PUBLIC_BASE_URL: 'http://localhost:3000' };

    const test = readLicensingConfig(stripeEnv(local));
    expect(test.kind === 'invalid' && withoutGate(test.problems)).toEqual([]);
    const live = readLicensingConfig(stripeEnv({ ...local, STRIPE_SECRET_KEY: 'sk_live_51abcdefghijklmnop' }));
    expect(live.kind === 'invalid' && withoutGate(live.problems)).toEqual(['PUBLIC_BASE_URL must be an https origin without a path']);
  });

  it('refuses Stripe and Paddle at the same time', () => {
    const result = readLicensingConfig(stripeEnv({ PADDLE_API_KEY: 'pdl_sdbx_apikey_0123456789' }));

    expect(result.kind === 'invalid' && withoutGate(result.problems)).toEqual([
      'Configure either the STRIPE_ or the PADDLE_ variables, not both'
    ]);
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
        'LICENSE_CODE_PEPPER must be at least 32 characters',
        'LICENSE_SIGNING_PRIVATE_KEY must be a base64-encoded Ed25519 PKCS#8 PEM key',
        'PADDLE_ENVIRONMENT is missing',
        'PADDLE_WEBHOOK_SECRET is missing',
        'PADDLE_PRICE_MONTHLY is not a Paddle price id',
        'PADDLE_PRICE_MONTHLY or PADDLE_PRICE_YEARLY is missing',
        'SMTP_URL is missing'
      ]
    });
    expect(JSON.stringify(result)).not.toContain('pdl_sdbx_apikey');
  });
});
