import { Pool } from 'pg';
import { migrate } from '../database/migrations';
import { createEntitlementSigner } from '../../license/signature';
import type { StructuredLogger } from '../structuredLog';
import type { BillingPlanId, MailSender } from './billing';
import { LicenseService } from './licenseService';
import { OutboxMailSender, SmtpMailSender } from './mail';
import { PaddleBillingProvider, type PaddleConfig, type PaddleEnvironment } from './paddle';
import { PostgresLicenseStore } from './postgresStore';

export type LicensingSettings = {
  databaseUrl: string;
  signingPrivateKeyPem: string;
  signingKeyId: string;
  codePepper: string;
  supportEmail: string;
  mail: { kind: 'smtp'; url: string; from: string } | { kind: 'outbox'; path: string };
  paddle: Omit<PaddleConfig, 'fetch'>;
};

export type LicensingConfigResult =
  | { kind: 'disabled' }
  | { kind: 'invalid'; problems: string[] }
  | { kind: 'enabled'; settings: LicensingSettings };

/** Every variable that belongs to billing; if none is set, the server runs without it. */
export const LICENSING_VARIABLES = [
  'DATABASE_URL',
  'LICENSE_SIGNING_PRIVATE_KEY',
  'LICENSE_SIGNING_KEY_ID',
  'LICENSE_CODE_PEPPER',
  'SUPPORT_EMAIL',
  'PADDLE_ENVIRONMENT',
  'PADDLE_API_KEY',
  'PADDLE_WEBHOOK_SECRET',
  'PADDLE_PRICE_MONTHLY',
  'PADDLE_PRICE_YEARLY',
  'PADDLE_PRICE_FOUNDING',
  'PADDLE_CHECKOUT_URL',
  'SMTP_URL',
  'MAIL_FROM',
  'MAIL_OUTBOX_FILE'
] as const;

const MIN_PEPPER_LENGTH = 32;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const PRICE_PATTERN = /^pri_[a-z0-9]{26}$/;

/**
 * Reads the billing configuration. Only variable names are ever reported, never values. Sandbox and
 * production are kept apart: a live API key in sandbox mode, or the other way round, is rejected.
 */
export function readLicensingConfig(env: Record<string, string | undefined>): LicensingConfigResult {
  const value = (name: (typeof LICENSING_VARIABLES)[number]): string => env[name]?.trim() ?? '';
  if (LICENSING_VARIABLES.every((name) => value(name) === '')) {
    return { kind: 'disabled' };
  }

  const problems: string[] = [];
  const required = (name: (typeof LICENSING_VARIABLES)[number]): string => {
    const found = value(name);
    if (!found) problems.push(`${name} is missing`);
    return found;
  };

  const databaseUrl = required('DATABASE_URL');
  const signingKey = required('LICENSE_SIGNING_PRIVATE_KEY');
  const signingKeyId = required('LICENSE_SIGNING_KEY_ID');
  const codePepper = required('LICENSE_CODE_PEPPER');
  const supportEmail = required('SUPPORT_EMAIL');
  const environment = required('PADDLE_ENVIRONMENT');
  const apiKey = required('PADDLE_API_KEY');
  const webhookSecret = required('PADDLE_WEBHOOK_SECRET');

  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) problems.push('DATABASE_URL must be a postgres:// URL');
  if (signingKeyId && !KEY_ID_PATTERN.test(signingKeyId)) problems.push('LICENSE_SIGNING_KEY_ID has an invalid format');
  if (codePepper && codePepper.length < MIN_PEPPER_LENGTH) problems.push(`LICENSE_CODE_PEPPER must be at least ${MIN_PEPPER_LENGTH} characters`);

  // The key is stored as base64 so the multi-line PEM fits into one environment variable.
  const signingPrivateKeyPem = signingKey ? Buffer.from(signingKey, 'base64').toString('utf8') : '';
  if (signingKey) {
    try {
      createEntitlementSigner(signingPrivateKeyPem, signingKeyId || 'check');
    } catch {
      problems.push('LICENSE_SIGNING_PRIVATE_KEY must be a base64-encoded Ed25519 PKCS#8 PEM key');
    }
  }

  if (environment && environment !== 'sandbox' && environment !== 'production') {
    problems.push('PADDLE_ENVIRONMENT must be sandbox or production');
  }
  if (apiKey && environment === 'sandbox' && !apiKey.startsWith('pdl_sdbx_')) {
    problems.push('PADDLE_API_KEY is not a sandbox key');
  }
  if (apiKey && environment === 'production' && !apiKey.startsWith('pdl_live_')) {
    problems.push('PADDLE_API_KEY is not a live key');
  }

  const prices: Partial<Record<BillingPlanId, string>> = {};
  for (const [plan, name] of [
    ['monthly', 'PADDLE_PRICE_MONTHLY'],
    ['yearly', 'PADDLE_PRICE_YEARLY'],
    ['founding', 'PADDLE_PRICE_FOUNDING']
  ] as const) {
    const price = value(name);
    if (!price) continue;
    if (PRICE_PATTERN.test(price)) prices[plan] = price;
    else problems.push(`${name} is not a Paddle price id`);
  }
  if (!prices.monthly && !prices.yearly) problems.push('PADDLE_PRICE_MONTHLY or PADDLE_PRICE_YEARLY is missing');

  const checkoutUrl = value('PADDLE_CHECKOUT_URL');
  if (checkoutUrl && !checkoutUrl.startsWith('https://')) problems.push('PADDLE_CHECKOUT_URL must use https');

  let mail: LicensingSettings['mail'] | null = null;
  if (value('SMTP_URL')) {
    if (!/^smtps?:\/\//.test(value('SMTP_URL'))) problems.push('SMTP_URL must be an smtp:// or smtps:// URL');
    mail = { kind: 'smtp', url: value('SMTP_URL'), from: required('MAIL_FROM') };
  } else if (value('MAIL_OUTBOX_FILE')) {
    // The outbox file contains activation codes and is only acceptable while testing against the sandbox.
    if (environment !== 'sandbox') problems.push('MAIL_OUTBOX_FILE is only allowed with PADDLE_ENVIRONMENT=sandbox');
    mail = { kind: 'outbox', path: value('MAIL_OUTBOX_FILE') };
  } else {
    problems.push('SMTP_URL is missing');
  }

  if (problems.length > 0 || !mail) {
    return { kind: 'invalid', problems };
  }
  return {
    kind: 'enabled',
    settings: {
      databaseUrl,
      signingPrivateKeyPem,
      signingKeyId,
      codePepper,
      supportEmail,
      mail,
      paddle: {
        environment: environment as PaddleEnvironment,
        apiKey,
        webhookSecret,
        prices,
        ...(checkoutUrl ? { checkoutUrl } : {})
      }
    }
  };
}

export type RunningLicensing = {
  service: LicenseService;
  close(): Promise<void>;
};

/** Connects the database, applies pending migrations and assembles the license service. */
export async function startLicensing(settings: LicensingSettings, logger: StructuredLogger): Promise<RunningLicensing> {
  const pool = new Pool({ connectionString: settings.databaseUrl, max: 10, idleTimeoutMillis: 30_000 });
  // An idle client losing its connection must not crash the process that also serves the overlays.
  pool.on('error', (error) => logger('error', 'database-pool-error', { error: error.name }));
  try {
    const applied = await migrate(pool);
    logger('info', 'database-migrated', { applied: applied.join(',') || 'none' });
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }

  const mailer: MailSender =
    settings.mail.kind === 'smtp' ? new SmtpMailSender(settings.mail.url, settings.mail.from) : new OutboxMailSender(settings.mail.path);
  const store = new PostgresLicenseStore(pool);
  const service = new LicenseService({
    store,
    provider: new PaddleBillingProvider(settings.paddle),
    signer: createEntitlementSigner(settings.signingPrivateKeyPem, settings.signingKeyId),
    mailer,
    codePepper: settings.codePepper,
    supportEmail: settings.supportEmail,
    logger
  });
  return { service, close: () => store.close() };
}
