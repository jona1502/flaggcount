import { describe, expect, it } from 'vitest';
import { createEntitlementSigner, generateSigningKeyPair } from '../../license/signature';
import type { LogFields } from '../structuredLog';
import { AdminService, MAX_MANUAL_DURATION_MS, parseLicenseSearch } from './adminService';
import type { BillingProvider, MailMessage } from './billing';
import { LicenseService } from './licenseService';
import { MemoryLicenseStore, type SubscriptionUpdate } from './store';

const START = Date.parse('2026-09-14T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const KEYS = generateSigningKeyPair();
const ADMIN = { subject: 'github:4242' };
const INSTALL_A = 'installation-aaaaaaaaaaaa';
const INSTALL_B = 'installation-bbbbbbbbbbbb';
const CODE_PATTERN = /^FC(-[0-9A-Z]{5}){4}$/;

const provider: BillingProvider = {
  name: 'stripe',
  verifyWebhook: () => ({ ok: false, reason: 'invalid-signature' }),
  createCheckout: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' }),
  createPortalSession: async () => ({ url: 'https://billing.stripe.com/p/session/test_1' }),
  customerEmail: async (customerId) => (customerId === 'cus_1' ? 'kunde@example.com' : null),
  customerIdsByEmail: async () => [],
  previewPrices: async () => []
};

function createAdmin() {
  let now = START;
  let ids = 0;
  const store = new MemoryLicenseStore();
  const mails: MailMessage[] = [];
  const logs: { event: string; fields?: LogFields }[] = [];
  const logger = (_level: string, event: string, fields?: LogFields) => void logs.push({ event, fields });
  // The counter leads, so every license gets its own support reference (the first ten characters).
  const newId = () => `${String(++ids).padStart(8, '0')}-0000-4000-8000-000000000000`;
  const licenses = new LicenseService({
    store,
    provider,
    signer: createEntitlementSigner(KEYS.privateKeyPem, 'k1'),
    mailer: { send: async (message) => void mails.push(message) },
    codePepper: 'test-pepper',
    supportEmail: 'support@example.com',
    logger,
    now: () => now,
    newId
  });
  const admin = new AdminService({ store, licenses, logger, stripeMode: 'test', now: () => now, newId });

  const subscription = async (overrides: Partial<SubscriptionUpdate> = {}) =>
    (
      await store.applySubscription(
        {
          provider: 'stripe',
          customerId: 'cus_1',
          subscriptionId: 'sub_1',
          status: 'active',
          currentPeriodEndsAt: new Date(START + 30 * DAY).toISOString(),
          scheduledCancelAt: null,
          canceledAt: null,
          occurredAt: new Date(now).toISOString(),
          ...overrides
        },
        newId,
        new Date(now).toISOString()
      )
    ).license;

  return { admin, licenses, store, mails, logs, subscription, advance: (ms: number) => (now += ms) };
}

describe('parseLicenseSearch', () => {
  it('recognizes ids, support references and provider ids', () => {
    expect(parseLicenseSearch('')).toEqual({ kind: 'recent' });
    expect(parseLicenseSearch(undefined)).toEqual({ kind: 'recent' });
    expect(parseLicenseSearch(' 00000000-0000-4000-8000-00000000000A ')).toEqual({ kind: 'id', value: '00000000-0000-4000-8000-00000000000a' });
    expect(parseLicenseSearch('fc-0000000000')).toEqual({ kind: 'reference', value: '0000000000' });
    expect(parseLicenseSearch('cus_Qx12ab')).toEqual({ kind: 'customer', value: 'cus_Qx12ab' });
    expect(parseLicenseSearch('ctm_01h8abcd')).toEqual({ kind: 'customer', value: 'ctm_01h8abcd' });
    expect(parseLicenseSearch('sub_1Nabcd')).toEqual({ kind: 'subscription', value: 'sub_1Nabcd' });
    expect(parseLicenseSearch('kunde@example.com')).toBeNull();
    expect(parseLicenseSearch("' OR 1=1 --")).toBeNull();
    expect(parseLicenseSearch(42)).toBeNull();
  });
});

describe('AdminService', () => {
  it('creates a manual license whose code is shown once and unlocks Pro', async () => {
    const { admin, licenses, logs } = createAdmin();

    const created = await admin.createManualLicense(ADMIN, {
      reason: 'creator',
      validUntil: new Date(START + 90 * DAY).toISOString(),
      note: 'Kooperation\nStream-Event'
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { license, code } = created.value;
    expect(code).toMatch(CODE_PATTERN);
    expect(license).toMatchObject({
      source: 'manual',
      legacy: false,
      manualReason: 'creator',
      supportNote: 'Kooperation Stream-Event',
      hasActivationCode: true,
      providerCustomerId: null,
      links: { customer: null, subscription: null },
      access: { status: 'active', endsAt: new Date(START + 90 * DAY).toISOString() }
    });
    expect(license.audit).toMatchObject([{ action: 'manual-license-created', adminSubject: 'github:4242', metadata: { reason: 'creator' } }]);

    const activation = await licenses.activate({ code, installationId: INSTALL_A });
    expect(activation.ok && activation.entitlement.expiresAt).toBe(new Date(START + 30 * DAY).toISOString());
    expect(JSON.stringify(logs)).not.toContain(code.slice(3));
    expect(JSON.stringify(license.audit)).not.toContain(code.slice(3));
  });

  it('refuses invalid manual licenses', async () => {
    const { admin } = createAdmin();
    const valid = { reason: 'support', validUntil: new Date(START + DAY).toISOString(), note: null };

    for (const input of [
      { ...valid, reason: 'friend' },
      { ...valid, validUntil: new Date(START - 1).toISOString() },
      { ...valid, validUntil: new Date(START + MAX_MANUAL_DURATION_MS + DAY).toISOString() },
      { ...valid, validUntil: 'tomorrow' },
      { ...valid, note: 'x'.repeat(501) }
    ]) {
      expect(await admin.createManualLicense(ADMIN, input)).toEqual({ ok: false, error: 'invalid-input' });
    }
    expect((await admin.createManualLicense(ADMIN, { ...valid, validUntil: null })).ok).toBe(true);
  });

  it('finds licenses by reference, provider ids and recency', async () => {
    const { admin, subscription, advance } = createAdmin();
    const paid = await subscription();
    advance(60_000);
    const manual = await admin.createManualLicense(ADMIN, { reason: 'testing', validUntil: null, note: null });
    if (!manual.ok) throw new Error('manual license failed');

    const ids = async (query: unknown) => {
      const result = await admin.search(query);
      return result.ok ? result.value.map((license) => license.id) : result.error;
    };
    expect(await ids('')).toEqual([manual.value.license.id, paid.id]);
    expect(await ids(manual.value.license.reference)).toEqual([manual.value.license.id]);
    expect(await ids('cus_1')).toEqual([paid.id]);
    expect(await ids('sub_1')).toEqual([paid.id]);
    expect(await ids('sub_unknown')).toEqual([]);
    expect(await ids('kunde@example.com')).toBe('invalid-input');
  });

  it('shows Stripe links, installations and marks licenses of a former provider', async () => {
    const { admin, subscription, licenses, store } = createAdmin();
    const paid = await subscription();
    const { code } = await licenses.replaceActivationCode(paid, 'return', 'support');
    await licenses.activate({ code, installationId: INSTALL_A });
    const paddle = await store.applySubscription(
      { provider: 'paddle', customerId: 'ctm_1', subscriptionId: 'sub_paddle', status: 'active', currentPeriodEndsAt: null, scheduledCancelAt: null, canceledAt: null, occurredAt: new Date(START).toISOString() },
      () => '00000000-0000-4000-8000-000000000099',
      new Date(START).toISOString()
    );

    const details = await admin.details(paid.id);
    expect(details.ok && details.value).toMatchObject({
      legacy: false,
      providerStatus: 'active',
      links: { customer: 'https://dashboard.stripe.com/test/customers/cus_1', subscription: 'https://dashboard.stripe.com/test/subscriptions/sub_1' },
      installations: [{ installationId: INSTALL_A }]
    });
    expect(await admin.details(paddle.license.id)).toMatchObject({ ok: true, value: { legacy: true, links: { customer: null } } });
    expect(await admin.details('not-a-uuid')).toEqual({ ok: false, error: 'not-found' });
  });

  it('blocks and unblocks a license without touching billing', async () => {
    const { admin, subscription, licenses } = createAdmin();
    const paid = await subscription();
    const { code } = await licenses.replaceActivationCode(paid, 'return', 'support');
    const activation = await licenses.activate({ code, installationId: INSTALL_A });
    if (!activation.ok) throw new Error('activation failed');
    const credentials = { licenseId: paid.id, installationId: INSTALL_A, secret: activation.activationSecret };

    const blocked = await admin.setBlocked(ADMIN, paid.id, true);
    expect(blocked.ok && blocked.value).toMatchObject({ supportStatus: 'blocked', providerStatus: 'active', access: null });
    expect(await licenses.refresh(credentials)).toEqual({ ok: false, error: 'license-inactive' });

    await admin.setBlocked(ADMIN, paid.id, false);
    expect((await licenses.refresh(credentials)).ok).toBe(true);
    const details = await admin.details(paid.id);
    expect(details.ok && details.value.audit.map((entry) => entry.action)).toEqual(['license-unblocked', 'license-blocked']);
    expect(await admin.setBlocked(ADMIN, paid.id, 'yes')).toEqual({ ok: false, error: 'invalid-input' });
  });

  it('leaves provider-managed billing fields to the payment provider', async () => {
    const { admin, subscription } = createAdmin();
    const paid = await subscription();

    expect(await admin.updateManualValidity(ADMIN, paid.id, new Date(START + DAY).toISOString())).toEqual({ ok: false, error: 'provider-managed' });
    expect(Object.getOwnPropertyNames(AdminService.prototype)).not.toEqual(expect.arrayContaining(['setStatus', 'refund', 'cancel']));
  });

  it('extends manual licenses and records the change', async () => {
    const { admin, advance } = createAdmin();
    const manual = await admin.createManualLicense(ADMIN, { reason: 'promotion', validUntil: new Date(START + DAY).toISOString(), note: null });
    if (!manual.ok) throw new Error('manual license failed');

    advance(2 * DAY);
    expect((await admin.details(manual.value.license.id)).ok && (await admin.details(manual.value.license.id))).toMatchObject({ value: { access: null } });
    const extended = await admin.updateManualValidity(ADMIN, manual.value.license.id, new Date(START + 10 * DAY).toISOString());

    expect(extended.ok && extended.value).toMatchObject({ access: { status: 'active' } });
    expect(extended.ok && extended.value.audit[0]).toMatchObject({ action: 'manual-validity-changed' });
  });

  it('deactivates installations so the computer can be replaced', async () => {
    const { admin, subscription, licenses } = createAdmin();
    const paid = await subscription();
    const { code } = await licenses.replaceActivationCode(paid, 'return', 'support');
    await licenses.activate({ code, installationId: INSTALL_A });
    await licenses.activate({ code, installationId: INSTALL_B });

    const result = await admin.deactivateInstallation(ADMIN, paid.id, INSTALL_A);

    expect(result.ok && result.value.installations.map((installation) => installation.installationId)).toEqual([INSTALL_B]);
    expect(result.ok && result.value.audit[0]).toMatchObject({ action: 'installation-deactivated', metadata: { installationId: INSTALL_A } });
    expect(await admin.deactivateInstallation(ADMIN, paid.id, INSTALL_A)).toEqual({ ok: false, error: 'installation-not-found' });
    expect(await admin.deactivateInstallation(ADMIN, paid.id, 'bad')).toEqual({ ok: false, error: 'invalid-input' });
  });

  it('renews activation codes by email for purchases and on screen for manual licenses', async () => {
    const { admin, subscription, licenses, mails } = createAdmin();
    const paid = await subscription();
    const { code: oldCode } = await licenses.replaceActivationCode(paid, 'return', 'support');
    const manual = await admin.createManualLicense(ADMIN, { reason: 'support', validUntil: null, note: null });
    if (!manual.ok) throw new Error('manual license failed');

    expect(await admin.renewActivationCode(ADMIN, paid.id, 'email')).toEqual({ ok: true, value: { code: null, mailed: true } });
    expect(mails.map((mail) => [mail.to, mail.subject])).toEqual([['kunde@example.com', 'Neuer Aktivierungscode für FlagCount Pro']]);
    expect(mails[0]?.text).toContain('Unser Support');
    expect(await licenses.activate({ code: oldCode ?? '', installationId: INSTALL_A })).toMatchObject({ error: 'invalid-code' });

    expect(await admin.renewActivationCode(ADMIN, manual.value.license.id, 'email')).toEqual({ ok: false, error: 'no-email' });
    const shown = await admin.renewActivationCode(ADMIN, manual.value.license.id, 'show');
    expect(shown.ok && shown.value.code).toMatch(CODE_PATTERN);
    expect(await admin.renewActivationCode(ADMIN, paid.id, 'sms')).toEqual({ ok: false, error: 'invalid-input' });
  });

  it('keeps internal notes out of the audit log and logs', async () => {
    const { admin, subscription, logs } = createAdmin();
    const paid = await subscription();

    const result = await admin.setNote(ADMIN, paid.id, 'Kunde meldet Doppelbuchung');

    expect(result.ok && result.value.supportNote).toBe('Kunde meldet Doppelbuchung');
    expect(result.ok && result.value.audit[0]).toMatchObject({ action: 'note-changed', metadata: { length: 26 } });
    expect(JSON.stringify(logs)).not.toContain('Doppelbuchung');
    expect(await admin.setNote(ADMIN, paid.id, '')).toMatchObject({ ok: true, value: { supportNote: null } });
  });
});
