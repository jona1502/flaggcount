import { randomUUID } from 'node:crypto';
import { licenseReference } from '../../../../shared/licensing';
import type { StructuredLogger } from '../structuredLog';
import { isInstallationId, licenseAccess, summarize, type InstallationSummary, type LicenseService } from './licenseService';
import type { StripeMode } from './stripe';
import {
  MANUAL_REASONS,
  MANUAL_SOURCE,
  type AuditEntry,
  type LicenseRecord,
  type LicenseSearch,
  type LicenseStore,
  type ManualReason
} from './store';

export const MAX_NOTE_LENGTH = 500;
export const SEARCH_LIMIT = 25;
const AUDIT_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Manual licenses should end; five years is the longest a single grant may run. */
export const MAX_MANUAL_DURATION_MS = 5 * 365 * DAY_MS;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The admin who acts, as proven by the admin login, e.g. `github:12345`. */
export type AdminActor = { subject: string };

export type AdminError = 'invalid-input' | 'not-found' | 'provider-managed' | 'no-email' | 'installation-not-found';

export type AdminResult<T> = { ok: true; value: T } | { ok: false; error: AdminError };

export type AdminLicenseSummary = {
  id: string;
  reference: string;
  source: string;
  /** A license of a provider the server no longer sells through, e.g. Paddle after the Stripe migration. */
  legacy: boolean;
  providerStatus: string | null;
  supportStatus: string;
  manualReason: ManualReason | null;
  manualValidUntil: string | null;
  access: { status: 'active' | 'grace'; endsAt: string | null } | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminLicenseDetails = AdminLicenseSummary & {
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  currentPeriodEndsAt: string | null;
  scheduledCancelAt: string | null;
  canceledAt: string | null;
  revokedAt: string | null;
  supportNote: string | null;
  hasActivationCode: boolean;
  codeIssuedAt: string | null;
  /** Direct links to the records in the Stripe dashboard. */
  links: { customer: string | null; subscription: string | null };
  installations: InstallationSummary[];
  audit: AuditEntry[];
};

export type AdminServiceOptions = {
  store: LicenseStore;
  licenses: LicenseService;
  logger: StructuredLogger;
  /** Mode of the Stripe account for dashboard links; `null` without Stripe. */
  stripeMode: StripeMode | null;
  now?: () => number;
  newId?: () => string;
};

/** Interprets the search box: empty for recent licenses, otherwise a license id, support reference or provider id. */
export function parseLicenseSearch(query: unknown): LicenseSearch | null {
  if (query === undefined || query === null) return { kind: 'recent' };
  if (typeof query !== 'string' || query.length > 100) return null;
  const value = query.trim();
  if (!value) return { kind: 'recent' };
  if (UUID_PATTERN.test(value)) return { kind: 'id', value: value.toLowerCase() };
  const reference = /^FC-?([A-Za-z0-9]{10})$/i.exec(value);
  if (reference?.[1]) return { kind: 'reference', value: reference[1].toUpperCase() };
  if (/^(cus|ctm)_[A-Za-z0-9]+$/.test(value)) return { kind: 'customer', value };
  if (/^sub_[A-Za-z0-9]+$/.test(value)) return { kind: 'subscription', value };
  return null;
}

/** Internal notes are plain, single-paragraph text; `undefined` if the input is not acceptable. */
function cleanNote(note: unknown): string | null | undefined {
  if (note === null || note === undefined) return null;
  if (typeof note !== 'string') return undefined;
  // Control characters such as line breaks become spaces.
  const cleaned = note.replace(/\p{Cc}+/gu, ' ').trim();
  if (cleaned.length > MAX_NOTE_LENGTH) return undefined;
  return cleaned || null;
}

/**
 * Support operations behind the admin login. Billing truth stays with the payment provider: paid status,
 * periods, prices, cancellations and refunds of provider licenses are changed in its dashboard and
 * arrive through webhooks. Admins manage installations, codes, support blocks, notes and manual licenses,
 * and every change is written to the audit log.
 */
export class AdminService {
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(private readonly options: AdminServiceOptions) {
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? randomUUID;
  }

  async search(query: unknown): Promise<AdminResult<AdminLicenseSummary[]>> {
    const search = parseLicenseSearch(query);
    if (!search) return { ok: false, error: 'invalid-input' };
    const licenses = await this.options.store.searchLicenses(search, SEARCH_LIMIT);
    return { ok: true, value: licenses.map((license) => this.summary(license)) };
  }

  async details(licenseId: unknown): Promise<AdminResult<AdminLicenseDetails>> {
    const license = await this.find(licenseId);
    if (!license) return { ok: false, error: 'not-found' };
    return { ok: true, value: await this.describe(license) };
  }

  async createManualLicense(
    actor: AdminActor,
    input: { reason: unknown; validUntil: unknown; note: unknown }
  ): Promise<AdminResult<{ license: AdminLicenseDetails; code: string }>> {
    const reason = MANUAL_REASONS.find((candidate) => candidate === input.reason);
    const validUntil = this.validUntil(input.validUntil);
    const note = cleanNote(input.note);
    if (!reason || validUntil === undefined || note === undefined) return { ok: false, error: 'invalid-input' };

    const license = await this.options.store.createManualLicense({ reason, validUntil, note }, this.newId(), this.timestamp());
    const { code } = await this.options.licenses.replaceActivationCode(license, 'return', 'support');
    if (!code) throw new Error('No activation code was returned');
    await this.audit(actor, 'manual-license-created', license.id, { reason, validUntil });
    const created = (await this.options.store.findById(license.id)) ?? license;
    return { ok: true, value: { license: await this.describe(created), code } };
  }

  async updateManualValidity(actor: AdminActor, licenseId: unknown, validUntil: unknown): Promise<AdminResult<AdminLicenseDetails>> {
    const license = await this.find(licenseId);
    if (!license) return { ok: false, error: 'not-found' };
    if (license.source !== MANUAL_SOURCE) return { ok: false, error: 'provider-managed' };
    const until = this.validUntil(validUntil);
    if (until === undefined) return { ok: false, error: 'invalid-input' };

    const updated = await this.options.store.updateManualValidity(license.id, until, this.timestamp());
    if (!updated) return { ok: false, error: 'not-found' };
    await this.audit(actor, 'manual-validity-changed', license.id, { from: license.manualValidUntil, to: until });
    return { ok: true, value: await this.describe(updated) };
  }

  /** A support block ends Pro at the next refresh, independently of billing, and can be lifted again. */
  async setBlocked(actor: AdminActor, licenseId: unknown, blocked: unknown): Promise<AdminResult<AdminLicenseDetails>> {
    if (typeof blocked !== 'boolean') return { ok: false, error: 'invalid-input' };
    const license = await this.find(licenseId);
    if (!license) return { ok: false, error: 'not-found' };

    const updated = await this.options.store.updateSupport(license.id, { supportStatus: blocked ? 'blocked' : 'none' }, this.timestamp());
    if (!updated) return { ok: false, error: 'not-found' };
    await this.audit(actor, blocked ? 'license-blocked' : 'license-unblocked', license.id, {});
    return { ok: true, value: await this.describe(updated) };
  }

  async setNote(actor: AdminActor, licenseId: unknown, note: unknown): Promise<AdminResult<AdminLicenseDetails>> {
    const cleaned = cleanNote(note);
    if (cleaned === undefined) return { ok: false, error: 'invalid-input' };
    const license = await this.find(licenseId);
    if (!license) return { ok: false, error: 'not-found' };

    const updated = await this.options.store.updateSupport(license.id, { supportNote: cleaned }, this.timestamp());
    if (!updated) return { ok: false, error: 'not-found' };
    // Only the length: the note itself may mention details that do not belong in an audit trail.
    await this.audit(actor, 'note-changed', license.id, { length: cleaned?.length ?? 0 });
    return { ok: true, value: await this.describe(updated) };
  }

  async deactivateInstallation(actor: AdminActor, licenseId: unknown, installationId: unknown): Promise<AdminResult<AdminLicenseDetails>> {
    const license = await this.find(licenseId);
    if (!license) return { ok: false, error: 'not-found' };
    if (!isInstallationId(installationId)) return { ok: false, error: 'invalid-input' };

    const deactivated = await this.options.store.deactivateInstallation(license.id, installationId, this.timestamp());
    if (!deactivated) return { ok: false, error: 'installation-not-found' };
    await this.audit(actor, 'installation-deactivated', license.id, { installationId });
    const current = (await this.options.store.findById(license.id)) ?? license;
    return { ok: true, value: await this.describe(current) };
  }

  /**
   * Replaces the activation code. `show` returns it once to the admin, e.g. for a support ticket; `email`
   * sends it to the address of the purchase, which only provider licenses have.
   */
  async renewActivationCode(
    actor: AdminActor,
    licenseId: unknown,
    delivery: unknown
  ): Promise<AdminResult<{ code: string | null; mailed: boolean }>> {
    if (delivery !== 'show' && delivery !== 'email') return { ok: false, error: 'invalid-input' };
    const license = await this.find(licenseId);
    if (!license) return { ok: false, error: 'not-found' };
    if (delivery === 'email' && (license.source === MANUAL_SOURCE || !license.providerCustomerId)) {
      return { ok: false, error: 'no-email' };
    }

    const result = await this.options.licenses.replaceActivationCode(license, delivery === 'show' ? 'return' : 'email', 'support');
    await this.audit(actor, delivery === 'show' ? 'code-renewed-shown' : 'code-renewed-emailed', license.id, { mailed: result.mailed });
    if (delivery === 'email' && !result.mailed) return { ok: false, error: 'no-email' };
    return { ok: true, value: result };
  }

  private async find(licenseId: unknown): Promise<LicenseRecord | null> {
    if (typeof licenseId !== 'string' || !UUID_PATTERN.test(licenseId)) return null;
    return this.options.store.findById(licenseId.toLowerCase());
  }

  /** `null` for no end, an ISO time within the allowed range, or `undefined` if invalid. */
  private validUntil(value: unknown): string | null | undefined {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') return undefined;
    const time = Date.parse(value);
    const now = this.now();
    if (Number.isNaN(time) || time <= now || time > now + MAX_MANUAL_DURATION_MS) return undefined;
    return new Date(time).toISOString();
  }

  private summary(license: LicenseRecord): AdminLicenseSummary {
    const access = licenseAccess(license, this.now());
    const billingSource = this.options.licenses.providerName;
    return {
      id: license.id,
      reference: licenseReference(license.id),
      source: license.source,
      legacy: license.source !== MANUAL_SOURCE && license.source !== billingSource,
      providerStatus: license.providerStatus,
      supportStatus: license.supportStatus,
      manualReason: license.manualReason,
      manualValidUntil: license.manualValidUntil,
      access: access ? { status: access.status, endsAt: access.endsAt === null ? null : new Date(access.endsAt).toISOString() } : null,
      createdAt: license.createdAt,
      updatedAt: license.updatedAt
    };
  }

  private async describe(license: LicenseRecord): Promise<AdminLicenseDetails> {
    const { store, stripeMode } = this.options;
    const [installations, audit] = await Promise.all([store.activeInstallations(license.id), store.listAudit(license.id, AUDIT_LIMIT)]);
    const dashboard = license.source === 'stripe' && stripeMode ? `https://dashboard.stripe.com/${stripeMode === 'test' ? 'test/' : ''}` : null;
    return {
      ...this.summary(license),
      providerCustomerId: license.providerCustomerId,
      providerSubscriptionId: license.providerSubscriptionId,
      currentPeriodEndsAt: license.currentPeriodEndsAt,
      scheduledCancelAt: license.scheduledCancelAt,
      canceledAt: license.canceledAt,
      revokedAt: license.revokedAt,
      supportNote: license.supportNote,
      hasActivationCode: license.codeHash !== null,
      codeIssuedAt: license.codeIssuedAt,
      links: {
        customer: dashboard && license.providerCustomerId ? `${dashboard}customers/${encodeURIComponent(license.providerCustomerId)}` : null,
        subscription:
          dashboard && license.providerSubscriptionId ? `${dashboard}subscriptions/${encodeURIComponent(license.providerSubscriptionId)}` : null
      },
      installations: installations.map(summarize),
      audit
    };
  }

  private async audit(actor: AdminActor, action: string, licenseId: string, metadata: AuditEntry['metadata']): Promise<void> {
    await this.options.store.appendAudit({
      id: this.newId(),
      adminSubject: actor.subject,
      action,
      licenseId,
      metadata,
      createdAt: this.timestamp()
    });
    this.options.logger('info', 'admin-action', { action, license: licenseReference(licenseId), admin: actor.subject });
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }
}
