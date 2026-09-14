import { randomUUID } from 'node:crypto';
import { FEATURES } from '../../../../shared/entitlements';
import {
  OFFLINE_GRACE_MS,
  REFRESH_INTERVAL_MS,
  licenseReference,
  type EntitlementStatus,
  type SignedEntitlement
} from '../../../../shared/licensing';
import type { EntitlementSigner } from '../../license/signature';
import type { StructuredLogger } from '../structuredLog';
import type { BillingEvent, BillingPlanId, BillingProvider, MailSender, PriceQuote } from './billing';
import { activationMail, recoveryMail } from './mailTemplates';
import {
  generateActivationCode,
  generateInstallationSecret,
  hashActivationCode,
  hashSecret,
  normalizeActivationCode,
  secretMatches
} from './secrets';
import { MANUAL_SOURCE, type InstallationRecord, type LicenseRecord, type LicenseStore } from './store';

export const MAX_INSTALLATIONS = 3;
/** Pro keeps working this long after a renewal payment failed, while the provider retries it. */
export const PAST_DUE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

export type LicenseAccess = {
  status: EntitlementStatus;
  /** Paid access ends here; `null` while the subscription renews. */
  endsAt: number | null;
};

/**
 * Whether a license grants Pro right now. Cancelling keeps access until the paid period ends; a
 * subscription whose first payment is still open, or that stopped being paid, never grants it.
 */
export function licenseAccess(license: LicenseRecord, now: number): LicenseAccess | null {
  if (license.revokedAt || license.supportStatus === 'blocked') return null;
  const time = (value: string | null): number | null => (value === null ? null : Date.parse(value));

  if (license.source === MANUAL_SOURCE) {
    const endsAt = time(license.manualValidUntil);
    return endsAt !== null && endsAt <= now ? null : { status: 'active', endsAt };
  }

  switch (license.providerStatus) {
    case 'active':
    case 'trialing': {
      const endsAt = time(license.scheduledCancelAt);
      return endsAt !== null && endsAt <= now ? null : { status: 'active', endsAt };
    }
    case 'past_due': {
      const endsAt = (time(license.currentPeriodEndsAt) ?? now) + PAST_DUE_GRACE_MS;
      return endsAt > now ? { status: 'grace', endsAt } : null;
    }
    case 'canceled': {
      const endsAt = time(license.scheduledCancelAt) ?? time(license.currentPeriodEndsAt);
      return endsAt !== null && endsAt > now ? { status: 'active', endsAt } : null;
    }
    case 'incomplete':
    case 'incomplete_expired':
    case 'unpaid':
    case 'paused':
    case null:
      return null;
  }
}

export type InstallationSummary = {
  installationId: string;
  activatedAt: string;
  lastSeenAt: string;
};

export type ActivationResult =
  | { ok: true; licenseId: string; activationSecret: string; entitlement: SignedEntitlement }
  | { ok: false; error: 'invalid-code' | 'license-inactive' | 'invalid-installation' }
  | { ok: false; error: 'installation-limit'; installations: InstallationSummary[] };

export type RefreshResult =
  | { ok: true; entitlement: SignedEntitlement }
  | { ok: false; error: 'invalid-installation' | 'license-inactive' };

export type InstallationCredentials = {
  licenseId: unknown;
  installationId: unknown;
  secret: unknown;
};

export type WebhookResult = { status: 200 | 400 | 401 | 500 };

export type PortalResult = { ok: true; url: string } | { ok: false; error: 'invalid-installation' | 'no-subscription' };

export type LicenseServiceOptions = {
  store: LicenseStore;
  provider: BillingProvider;
  signer: EntitlementSigner;
  mailer: MailSender;
  /** Keys the activation code hashes; kept in the environment, never in the database. */
  codePepper: string;
  logger: StructuredLogger;
  supportEmail: string;
  now?: () => number;
  newId?: () => string;
  maxInstallations?: number;
};

/**
 * Keeps subscriptions in sync with the payment provider, hands out activation codes and signs the
 * entitlements desktop apps use to unlock Pro. Stores no names, email addresses or payment data.
 */
export class LicenseService {
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly maxInstallations: number;

  constructor(private readonly options: LicenseServiceOptions) {
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? randomUUID;
    this.maxInstallations = options.maxInstallations ?? MAX_INSTALLATIONS;
  }

  get providerName(): string {
    return this.options.provider.name;
  }

  async handleWebhook(rawBody: string, signatureHeader: string | undefined): Promise<WebhookResult> {
    const { store, provider, logger } = this.options;
    const verification = provider.verifyWebhook(rawBody, signatureHeader, this.now());
    if (!verification.ok) {
      logger('warn', 'webhook-rejected', { reason: verification.reason });
      return { status: verification.reason === 'invalid-payload' ? 400 : 401 };
    }

    const { event } = verification;
    const now = this.timestamp();
    if ((await store.beginWebhookEvent(event.eventId, event.eventType, event.occurredAt, now)) === 'duplicate') {
      logger('info', 'webhook-duplicate', { eventType: event.eventType });
      return { status: 200 };
    }

    try {
      switch (event.kind) {
        case 'subscription': {
          const { license, created, applied } = await store.applySubscription(
            { ...event.subscription, provider: provider.name, occurredAt: event.occurredAt },
            this.newId,
            now
          );
          logger('info', 'subscription-synced', {
            eventType: event.eventType,
            license: licenseReference(license.id),
            status: license.providerStatus,
            created,
            applied
          });
          // The first code goes out once the license grants Pro, not while the first payment is still open.
          if (license.codeHash === null && licenseAccess(license, this.now())) {
            await this.issueActivationCode(license, 'activation');
          }
          break;
        }
        case 'adjustment':
          await this.applyAdjustment(event);
          break;
        case 'other':
          // Unknown or unused event types are acknowledged, so the provider does not retry them forever.
          logger('info', 'webhook-ignored', { eventType: event.eventType });
          break;
      }
      await store.completeWebhookEvent(event.eventId, this.timestamp());
      return { status: 200 };
    } catch (error) {
      await store.abandonWebhookEvent(event.eventId).catch(() => undefined);
      logger('error', 'webhook-failed', { eventType: event.eventType, error: errorName(error) });
      return { status: 500 };
    }
  }

  async activate(input: { code: unknown; installationId: unknown; replaceInstallationId?: unknown }): Promise<ActivationResult> {
    const { store, logger } = this.options;
    const code = normalizeActivationCode(input.code);
    if (!code) return { ok: false, error: 'invalid-code' };
    if (!isInstallationId(input.installationId)) return { ok: false, error: 'invalid-installation' };
    const replace = isInstallationId(input.replaceInstallationId) ? input.replaceInstallationId : undefined;

    const license = await store.findByCodeHash(hashActivationCode(code, this.options.codePepper));
    if (!license) {
      logger('warn', 'activation-failed', { reason: 'invalid-code' });
      return { ok: false, error: 'invalid-code' };
    }
    const access = licenseAccess(license, this.now());
    if (!access) {
      logger('info', 'activation-failed', { reason: 'license-inactive', license: licenseReference(license.id) });
      return { ok: false, error: 'license-inactive' };
    }

    const secret = generateInstallationSecret();
    const result = await store.activateInstallation({
      licenseId: license.id,
      installationId: input.installationId,
      secretHash: hashSecret(secret),
      now: this.timestamp(),
      maxActive: this.maxInstallations,
      replaceInstallationId: replace
    });
    if (result === 'limit-reached') {
      const installations = (await store.activeInstallations(license.id)).map(summarize);
      logger('info', 'activation-failed', { reason: 'installation-limit', license: licenseReference(license.id) });
      return { ok: false, error: 'installation-limit', installations };
    }

    logger('info', 'installation-activated', { license: licenseReference(license.id), replaced: replace !== undefined });
    return {
      ok: true,
      licenseId: license.id,
      activationSecret: secret,
      entitlement: this.sign(license, input.installationId, access)
    };
  }

  async refresh(credentials: InstallationCredentials): Promise<RefreshResult> {
    const { store } = this.options;
    const verified = await this.verifyInstallation(credentials);
    if (!verified) return { ok: false, error: 'invalid-installation' };
    const { license, installation } = verified;

    await store.touchInstallation(license.id, installation.installationId, this.timestamp());
    const access = licenseAccess(license, this.now());
    if (!access) {
      this.options.logger('info', 'refresh-denied', { license: licenseReference(license.id), status: license.providerStatus ?? license.source });
      return { ok: false, error: 'license-inactive' };
    }
    return { ok: true, entitlement: this.sign(license, installation.installationId, access) };
  }

  async deactivate(credentials: InstallationCredentials): Promise<boolean> {
    const verified = await this.verifyInstallation(credentials);
    if (!verified) return false;
    const deactivated = await this.options.store.deactivateInstallation(
      verified.license.id,
      verified.installation.installationId,
      this.timestamp()
    );
    this.options.logger('info', 'installation-deactivated', { license: licenseReference(verified.license.id) });
    return deactivated;
  }

  /**
   * Sends new activation codes to the email address of the purchase. Always succeeds from the caller's
   * point of view, so the endpoint does not reveal whether an address has bought Pro.
   */
  async recover(email: unknown): Promise<void> {
    const { store, provider, logger } = this.options;
    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) return;

    try {
      const customerIds = await provider.customerIdsByEmail(email.trim().toLowerCase());
      let sent = 0;
      for (const customerId of customerIds) {
        for (const license of await store.findByCustomer(provider.name, customerId)) {
          if (!licenseAccess(license, this.now())) continue;
          await this.issueActivationCode(license, 'recovery');
          sent++;
        }
      }
      logger('info', 'recovery-requested', { licenses: sent });
    } catch (error) {
      logger('error', 'recovery-failed', { error: errorName(error) });
    }
  }

  /**
   * A short-lived link to the provider's customer portal for invoices, payment methods and cancelling.
   * Created for every request and never stored. Manual licenses have no subscription to manage.
   */
  async portal(credentials: InstallationCredentials): Promise<PortalResult> {
    const verified = await this.verifyInstallation(credentials);
    if (!verified) return { ok: false, error: 'invalid-installation' };
    const { license } = verified;
    if (license.source !== this.options.provider.name || !license.providerCustomerId || !license.providerSubscriptionId) {
      return { ok: false, error: 'no-subscription' };
    }
    const { url } = await this.options.provider.createPortalSession(license.providerCustomerId, license.providerSubscriptionId);
    return { ok: true, url };
  }

  checkout(plan: BillingPlanId): Promise<{ url: string }> {
    return this.options.provider.createCheckout(plan);
  }

  prices(location: { ip?: string; countryCode?: string }): Promise<PriceQuote[]> {
    return this.options.provider.previewPrices(location);
  }

  ping(): Promise<void> {
    return this.options.store.ping();
  }

  /** Full refunds and chargebacks end Pro right away; a reversed chargeback restores it. Free is never affected. */
  private async applyAdjustment(event: Extract<BillingEvent, { kind: 'adjustment' }>): Promise<void> {
    const { store, provider, logger } = this.options;
    if (!event.subscriptionId || !event.approved) return;
    const license = await store.findBySubscription(provider.name, event.subscriptionId);
    if (!license) return;

    const revoke = event.action === 'chargeback' || (event.action === 'refund' && event.full);
    if (revoke) {
      await store.setRevoked(license.id, this.timestamp(), this.timestamp());
      logger('info', 'license-revoked', { license: licenseReference(license.id), action: event.action });
    } else if (event.action === 'chargeback_reverse' && license.revokedAt) {
      await store.setRevoked(license.id, null, this.timestamp());
      logger('info', 'license-restored', { license: licenseReference(license.id) });
    }
  }

  private async issueActivationCode(license: LicenseRecord, reason: 'activation' | 'recovery'): Promise<void> {
    const { store, provider, mailer, logger, supportEmail, codePepper } = this.options;
    const code = generateActivationCode();
    const normalized = normalizeActivationCode(code);
    if (!normalized) throw new Error('Generated an invalid activation code');
    await store.setActivationCode(license.id, hashActivationCode(normalized, codePepper), this.timestamp());

    // A failed email must not fail the purchase: the customer can request the code again.
    try {
      const email = license.providerCustomerId ? await provider.customerEmail(license.providerCustomerId) : null;
      if (!email) {
        logger('warn', 'activation-mail-skipped', { license: licenseReference(license.id), reason: 'no-email' });
        return;
      }
      const reference = licenseReference(license.id);
      const message = reason === 'activation' ? activationMail(code, reference, supportEmail) : recoveryMail(code, reference, supportEmail);
      await mailer.send({ to: email, ...message });
      logger('info', 'activation-mail-sent', { license: reference, reason });
    } catch (error) {
      logger('error', 'activation-mail-failed', { license: licenseReference(license.id), error: errorName(error) });
    }
  }

  private async verifyInstallation(
    credentials: InstallationCredentials
  ): Promise<{ license: LicenseRecord; installation: InstallationRecord } | null> {
    const { licenseId, installationId, secret } = credentials;
    if (typeof licenseId !== 'string' || licenseId.length > 64 || !isInstallationId(installationId)) return null;
    const license = await this.options.store.findById(licenseId);
    const installation = license ? await this.options.store.findInstallation(license.id, installationId) : null;
    if (!license || !installation || installation.deactivatedAt !== null || !secretMatches(secret, installation.secretHash)) {
      return null;
    }
    return { license, installation };
  }

  private sign(license: LicenseRecord, installationId: string, access: LicenseAccess): SignedEntitlement {
    const now = this.now();
    const expiresAt = Math.min(now + OFFLINE_GRACE_MS, access.endsAt ?? Number.POSITIVE_INFINITY);
    return this.options.signer.sign({
      version: 1,
      licenseId: license.id,
      installationId,
      plan: 'pro',
      status: access.status,
      issuedAt: new Date(now).toISOString(),
      refreshAfter: new Date(Math.min(now + REFRESH_INTERVAL_MS, expiresAt)).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      features: [...FEATURES]
    });
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }
}

function isInstallationId(value: unknown): value is string {
  return typeof value === 'string' && INSTALLATION_ID_PATTERN.test(value);
}

function summarize(installation: InstallationRecord): InstallationSummary {
  return {
    installationId: installation.installationId,
    activatedAt: installation.activatedAt,
    lastSeenAt: installation.lastSeenAt
  };
}

/** Only the error class, never its message: provider errors may echo request data. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
