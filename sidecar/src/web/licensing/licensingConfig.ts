import { Pool } from 'pg';
import { migrate } from '../database/migrations';
import { createEntitlementSigner } from '../../license/signature';
import type { StructuredLogger } from '../structuredLog';
import type { BillingPlanId, BillingProvider, MailSender } from './billing';
import { LicenseService } from './licenseService';
import { OutboxMailSender, SmtpMailSender } from './mail';
import { PaddleBillingProvider, type PaddleConfig, type PaddleEnvironment } from './paddle';
import { PostgresLicenseStore } from './postgresStore';
import { StripeBillingProvider, stripeKeyMode, type StripeConfig } from './stripe';

export type BillingSettings =
  | { provider: 'paddle'; paddle: Omit<PaddleConfig, 'fetch'> }
  | { provider: 'stripe'; stripe: Omit<StripeConfig, 'fetch'> };

export type LicensingSettings = {
  databaseUrl: string;
  signingPrivateKeyPem: string;
  signingKeyId: string;
  codePepper: string;
  supportEmail: string;
  mail: { kind: 'smtp'; url: string; from: string } | { kind: 'outbox'; path: string };
  billing: BillingSettings;
};

export type LicensingConfigResult =
  | { kind: 'disabled' }
  | { kind: 'invalid'; problems: string[] }
  | { kind: 'enabled'; settings: LicensingSettings };

const PADDLE_VARIABLES = [
  'PADDLE_ENVIRONMENT',
  'PADDLE_API_KEY',
  'PADDLE_WEBHOOK_SECRET',
  'PADDLE_PRICE_MONTHLY',
  'PADDLE_PRICE_YEARLY',
  'PADDLE_PRICE_FOUNDING',
  'PADDLE_CHECKOUT_URL'
] as const;

const STRIPE_VARIABLES = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_MONTHLY',
  'STRIPE_PRICE_YEARLY',
  'STRIPE_PRICE_FOUNDING',
  'STRIPE_PORTAL_CONFIGURATION_ID',
  'STRIPE_MANAGED_PAYMENTS_ENABLED'
] as const;

/** Every variable that belongs to billing; if none is set, the server runs without it. */
export const LICENSING_VARIABLES = [
  'DATABASE_URL',
  'LICENSE_SIGNING_PRIVATE_KEY',
  'LICENSE_SIGNING_KEY_ID',
  'LICENSE_CODE_PEPPER',
  'SUPPORT_EMAIL',
  'PUBLIC_BASE_URL',
  ...PADDLE_VARIABLES,
  ...STRIPE_VARIABLES,
  'SMTP_URL',
  'MAIL_FROM',
  'MAIL_OUTBOX_FILE'
] as const;

type LicensingVariable = (typeof LICENSING_VARIABLES)[number];

const MIN_PEPPER_LENGTH = 32;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const PADDLE_PRICE_PATTERN = /^pri_[a-z0-9]{26}$/;
const STRIPE_PRICE_PATTERN = /^price_[A-Za-z0-9]{8,}$/;
const STRIPE_WEBHOOK_SECRET_PATTERN = /^whsec_[A-Za-z0-9+/=]{16,}$/;
const STRIPE_PORTAL_CONFIGURATION_PATTERN = /^bpc_[A-Za-z0-9]{8,}$/;

type Reader = {
  value: (name: LicensingVariable) => string;
  required: (name: LicensingVariable) => string;
  problems: string[];
};

/**
 * Reads the billing configuration. Only variable names are ever reported, never values. Test and live
 * data are kept apart: a live key in sandbox mode, or the other way round, is rejected, and the mail
 * outbox file is refused outside of testing.
 */
export function readLicensingConfig(env: Record<string, string | undefined>): LicensingConfigResult {
  const value = (name: LicensingVariable): string => env[name]?.trim() ?? '';
  if (LICENSING_VARIABLES.every((name) => value(name) === '')) {
    return { kind: 'disabled' };
  }

  const problems: string[] = [];
  const required = (name: LicensingVariable): string => {
    const found = value(name);
    if (!found) problems.push(`${name} is missing`);
    return found;
  };
  const reader: Reader = { value, required, problems };

  const databaseUrl = required('DATABASE_URL');
  const signingKey = required('LICENSE_SIGNING_PRIVATE_KEY');
  const signingKeyId = required('LICENSE_SIGNING_KEY_ID');
  const codePepper = required('LICENSE_CODE_PEPPER');
  const supportEmail = required('SUPPORT_EMAIL');

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

  const usesStripe = STRIPE_VARIABLES.some((name) => value(name) !== '');
  const usesPaddle = PADDLE_VARIABLES.some((name) => value(name) !== '');
  if (usesStripe && usesPaddle) problems.push('Configure either the STRIPE_ or the PADDLE_ variables, not both');
  const billing = usesStripe ? readStripe(reader) : readPaddle(reader);
  const testing = billing.provider === 'stripe' ? billing.stripe.mode === 'test' : billing.paddle.environment === 'sandbox';

  let mail: LicensingSettings['mail'] | null = null;
  if (value('SMTP_URL')) {
    if (!/^smtps?:\/\//.test(value('SMTP_URL'))) problems.push('SMTP_URL must be an smtp:// or smtps:// URL');
    mail = { kind: 'smtp', url: value('SMTP_URL'), from: required('MAIL_FROM') };
  } else if (value('MAIL_OUTBOX_FILE')) {
    // The outbox file contains activation codes and is only acceptable while testing.
    if (!testing) {
      problems.push(
        billing.provider === 'stripe'
          ? 'MAIL_OUTBOX_FILE is only allowed with a Stripe test key'
          : 'MAIL_OUTBOX_FILE is only allowed with PADDLE_ENVIRONMENT=sandbox'
      );
    }
    mail = { kind: 'outbox', path: value('MAIL_OUTBOX_FILE') };
  } else {
    problems.push('SMTP_URL is missing');
  }

  if (problems.length > 0 || !mail) {
    return { kind: 'invalid', problems };
  }
  return {
    kind: 'enabled',
    settings: { databaseUrl, signingPrivateKeyPem, signingKeyId, codePepper, supportEmail, mail, billing }
  };
}

function readPrices(reader: Reader, names: Record<BillingPlanId, LicensingVariable>, pattern: RegExp, provider: string) {
  const prices: Partial<Record<BillingPlanId, string>> = {};
  for (const [plan, name] of Object.entries(names) as [BillingPlanId, LicensingVariable][]) {
    const price = reader.value(name);
    if (!price) continue;
    if (pattern.test(price)) prices[plan] = price;
    else reader.problems.push(`${name} is not a ${provider} price id`);
  }
  if (!prices.monthly && !prices.yearly) reader.problems.push(`${names.monthly} or ${names.yearly} is missing`);
  return prices;
}

function readPaddle(reader: Reader): BillingSettings {
  const { value, required, problems } = reader;
  const environment = required('PADDLE_ENVIRONMENT');
  const apiKey = required('PADDLE_API_KEY');
  const webhookSecret = required('PADDLE_WEBHOOK_SECRET');

  if (environment && environment !== 'sandbox' && environment !== 'production') {
    problems.push('PADDLE_ENVIRONMENT must be sandbox or production');
  }
  if (apiKey && environment === 'sandbox' && !apiKey.startsWith('pdl_sdbx_')) {
    problems.push('PADDLE_API_KEY is not a sandbox key');
  }
  if (apiKey && environment === 'production' && !apiKey.startsWith('pdl_live_')) {
    problems.push('PADDLE_API_KEY is not a live key');
  }

  const prices = readPrices(
    reader,
    { monthly: 'PADDLE_PRICE_MONTHLY', yearly: 'PADDLE_PRICE_YEARLY', founding: 'PADDLE_PRICE_FOUNDING' },
    PADDLE_PRICE_PATTERN,
    'Paddle'
  );
  const checkoutUrl = value('PADDLE_CHECKOUT_URL');
  if (checkoutUrl && !checkoutUrl.startsWith('https://')) problems.push('PADDLE_CHECKOUT_URL must use https');

  return {
    provider: 'paddle',
    paddle: {
      environment: environment as PaddleEnvironment,
      apiKey,
      webhookSecret,
      prices,
      ...(checkoutUrl ? { checkoutUrl } : {})
    }
  };
}

function readStripe(reader: Reader): BillingSettings {
  const { value, required, problems } = reader;
  const secretKey = required('STRIPE_SECRET_KEY');
  const webhookSecret = required('STRIPE_WEBHOOK_SECRET');
  const publicBaseUrl = required('PUBLIC_BASE_URL').replace(/\/+$/, '');

  const mode = secretKey ? stripeKeyMode(secretKey) : null;
  if (secretKey && !mode) problems.push('STRIPE_SECRET_KEY is not a Stripe secret or restricted key');
  if (webhookSecret && !STRIPE_WEBHOOK_SECRET_PATTERN.test(webhookSecret)) {
    problems.push('STRIPE_WEBHOOK_SECRET is not a Stripe webhook signing secret');
  }

  const prices = readPrices(
    reader,
    { monthly: 'STRIPE_PRICE_MONTHLY', yearly: 'STRIPE_PRICE_YEARLY', founding: 'STRIPE_PRICE_FOUNDING' },
    STRIPE_PRICE_PATTERN,
    'Stripe'
  );

  const portalConfigurationId = value('STRIPE_PORTAL_CONFIGURATION_ID');
  if (portalConfigurationId && !STRIPE_PORTAL_CONFIGURATION_PATTERN.test(portalConfigurationId)) {
    problems.push('STRIPE_PORTAL_CONFIGURATION_ID is not a portal configuration id');
  }

  const managedPayments = value('STRIPE_MANAGED_PAYMENTS_ENABLED');
  if (managedPayments && managedPayments !== 'true' && managedPayments !== 'false') {
    problems.push('STRIPE_MANAGED_PAYMENTS_ENABLED must be true or false');
  }

  if (publicBaseUrl) {
    let url: URL | null = null;
    try {
      url = new URL(publicBaseUrl);
    } catch {
      // Reported below.
    }
    const localTest = mode === 'test' && url?.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (!url || (url.protocol !== 'https:' && !localTest) || url.pathname !== '/' || url.search || url.hash) {
      problems.push('PUBLIC_BASE_URL must be an https origin without a path');
    }
  }

  // Checkout, webhooks and the customer portal are added step by step; until then Stripe stays off.
  if (secretKey) problems.push('Stripe billing is not available in this version yet');

  return {
    provider: 'stripe',
    stripe: {
      mode: mode ?? 'test',
      secretKey,
      webhookSecret,
      prices,
      ...(portalConfigurationId ? { portalConfigurationId } : {}),
      managedPayments: managedPayments === 'true',
      publicBaseUrl
    }
  };
}

export type RunningLicensing = {
  service: LicenseService;
  close(): Promise<void>;
};

function createBillingProvider(billing: BillingSettings): BillingProvider {
  switch (billing.provider) {
    case 'paddle':
      return new PaddleBillingProvider(billing.paddle);
    case 'stripe':
      return new StripeBillingProvider(billing.stripe);
  }
}

/** Human-readable provider and mode for the startup log, without any secret. */
export function describeBilling(billing: BillingSettings): string {
  return billing.provider === 'stripe' ? `Stripe ${billing.stripe.mode} mode` : `Paddle ${billing.paddle.environment}`;
}

/** Connects the database, applies pending migrations and assembles the license service. */
export async function startLicensing(settings: LicensingSettings, logger: StructuredLogger): Promise<RunningLicensing> {
  const provider = createBillingProvider(settings.billing);
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
    provider,
    signer: createEntitlementSigner(settings.signingPrivateKeyPem, settings.signingKeyId),
    mailer,
    codePepper: settings.codePepper,
    supportEmail: settings.supportEmail,
    logger
  });
  return { service, close: () => store.close() };
}
