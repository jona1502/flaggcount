import { describe, expect, it, vi } from 'vitest';
import { FEATURES } from '../../../../shared/entitlements';
import { OFFLINE_GRACE_MS, entitlementSigningPayload, type SignedEntitlement } from '../../../../shared/licensing';
import { createEntitlementSigner, createEntitlementVerifier, generateSigningKeyPair } from '../../license/signature';
import type { LogFields } from '../structuredLog';
import type { BillingEvent, BillingProvider, MailMessage } from './billing';
import { LicenseService, PAST_DUE_GRACE_MS, licenseAccess } from './licenseService';
import { MemoryLicenseStore, type LicenseRecord } from './store';

const START = Date.parse('2026-09-13T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const KEYS = generateSigningKeyPair();
const verify = createEntitlementVerifier({ k1: KEYS.publicKey });
const INSTALL_A = 'installation-aaaaaaaaaaaa';
const INSTALL_B = 'installation-bbbbbbbbbbbb';
const INSTALL_C = 'installation-cccccccccccc';
const INSTALL_D = 'installation-dddddddddddd';

class FakeProvider implements BillingProvider {
  readonly name = 'paddle';
  readonly emails = new Map([['ctm_1', 'kunde@example.com']]);
  failEmailLookup = false;

  verifyWebhook(rawBody: string, signatureHeader: string | undefined) {
    if (signatureHeader !== 'valid') return { ok: false as const, reason: 'invalid-signature' as const };
    return { ok: true as const, event: JSON.parse(rawBody) as BillingEvent };
  }

  createCheckout = vi.fn(async () => ({ url: 'https://pay.example/checkout' }));
  createPortalSession = vi.fn(async (customerId: string, subscriptionId: string) => ({
    url: `https://portal.example/${customerId}/${subscriptionId}`
  }));

  async customerEmail(customerId: string) {
    if (this.failEmailLookup) throw new TypeError('provider down');
    return this.emails.get(customerId) ?? null;
  }

  async customerIdsByEmail(email: string) {
    return [...this.emails].filter(([, address]) => address === email).map(([id]) => id);
  }

  previewPrices = vi.fn(async () => []);
}

function createService() {
  let now = START;
  let ids = 0;
  const store = new MemoryLicenseStore();
  const provider = new FakeProvider();
  const mails: MailMessage[] = [];
  const logs: { level: string; event: string; fields?: LogFields }[] = [];
  const service = new LicenseService({
    store,
    provider,
    signer: createEntitlementSigner(KEYS.privateKeyPem, 'k1'),
    mailer: { send: async (message) => void mails.push(message) },
    codePepper: 'test-pepper',
    supportEmail: 'support@example.com',
    logger: (level, event, fields) => logs.push({ level, event, fields }),
    now: () => now,
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`
  });

  let events = 0;
  const webhook = (event: Record<string, unknown>, signature = 'valid') =>
    service.handleWebhook(
      JSON.stringify({ eventId: `evt_${++events}`, occurredAt: new Date(now).toISOString(), ...event }),
      signature
    );
  const subscription = (overrides: Record<string, unknown> = {}, eventType = 'subscription.created') =>
    webhook({
      kind: 'subscription',
      eventType,
      subscription: {
        customerId: 'ctm_1',
        subscriptionId: 'sub_1',
        status: 'active',
        currentPeriodEndsAt: new Date(START + 30 * DAY).toISOString(),
        scheduledCancelAt: null,
        canceledAt: null,
        ...overrides
      }
    });
  const lastCode = (): string => {
    const match = /FC(-[0-9A-Z]{5}){4}/.exec(mails.at(-1)?.text ?? '');
    if (!match) throw new Error('no activation code sent');
    return match[0];
  };
  const activate = (installationId = INSTALL_A, code = lastCode()) => service.activate({ code, installationId });

  return {
    service,
    store,
    provider,
    mails,
    logs,
    webhook,
    subscription,
    lastCode,
    activate,
    advance: (ms: number) => (now += ms)
  };
}

const isAuthentic = (entitlement: SignedEntitlement) =>
  verify(entitlementSigningPayload(entitlement), entitlement.signature, entitlement.keyId);

describe('LicenseService', () => {
  it('creates a license for a new subscription and emails the activation code', async () => {
    const { subscription, mails, logs } = createService();

    expect(await subscription()).toEqual({ status: 200 });

    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: 'kunde@example.com', subject: 'Dein Aktivierungscode für FlagCount Pro' });
    const code = /FC(-[0-9A-Z]{5}){4}/.exec(mails[0]!.text)?.[0] ?? '';
    const logged = JSON.stringify(logs);
    expect(logged).not.toContain(code.slice(3));
    expect(logged).not.toContain('kunde@example.com');
  });

  it('activates Pro with a signed, installation-bound entitlement', async () => {
    const { subscription, activate, lastCode } = createService();
    await subscription();

    const result = await activate(INSTALL_A, lastCode().toLowerCase().replaceAll('-', ' '));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.activationSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.entitlement).toMatchObject({
      version: 1,
      keyId: 'k1',
      installationId: INSTALL_A,
      plan: 'pro',
      status: 'active',
      issuedAt: new Date(START).toISOString(),
      refreshAfter: new Date(START + 7 * DAY).toISOString(),
      expiresAt: new Date(START + OFFLINE_GRACE_MS).toISOString(),
      features: [...FEATURES]
    });
    expect(isAuthentic(result.entitlement)).toBe(true);
  });

  it('rejects unknown codes and malformed installations', async () => {
    const { subscription, service, lastCode } = createService();
    await subscription();

    expect(await service.activate({ code: 'FC-00000-00000-00000-00000', installationId: INSTALL_A })).toEqual({
      ok: false,
      error: 'invalid-code'
    });
    expect(await service.activate({ code: 'not a code', installationId: INSTALL_A })).toMatchObject({ error: 'invalid-code' });
    expect(await service.activate({ code: lastCode(), installationId: 'short' })).toMatchObject({ error: 'invalid-installation' });
  });

  it('allows three installations and lets the fourth replace one of them', async () => {
    const { subscription, activate, service, lastCode } = createService();
    await subscription();

    for (const installation of [INSTALL_A, INSTALL_B, INSTALL_C, INSTALL_A]) {
      expect((await activate(installation)).ok).toBe(true);
    }
    const refused = await activate(INSTALL_D);
    expect(refused).toMatchObject({ ok: false, error: 'installation-limit' });
    expect(refused.ok === false && 'installations' in refused ? refused.installations.map((item) => item.installationId) : []).toEqual([
      INSTALL_A,
      INSTALL_B,
      INSTALL_C
    ]);

    const replaced = await service.activate({ code: lastCode(), installationId: INSTALL_D, replaceInstallationId: INSTALL_B });
    expect(replaced.ok).toBe(true);
  });

  it('refreshes and deactivates only with the installation secret', async () => {
    const { subscription, activate, service, advance } = createService();
    await subscription();
    const activation = await activate();
    if (!activation.ok) throw new Error('activation failed');
    const credentials = { licenseId: activation.licenseId, installationId: INSTALL_A, secret: activation.activationSecret };

    advance(8 * DAY);
    const refreshed = await service.refresh(credentials);
    expect(refreshed.ok && refreshed.entitlement.issuedAt).toBe(new Date(START + 8 * DAY).toISOString());
    expect(await service.refresh({ ...credentials, secret: 'wrong' })).toEqual({ ok: false, error: 'invalid-installation' });
    expect(await service.refresh({ ...credentials, installationId: INSTALL_B })).toEqual({ ok: false, error: 'invalid-installation' });

    expect(await service.deactivate({ ...credentials, secret: 'wrong' })).toBe(false);
    expect(await service.deactivate(credentials)).toBe(true);
    expect(await service.refresh(credentials)).toEqual({ ok: false, error: 'invalid-installation' });
  });

  it('keeps Pro until the end of the paid period after a cancellation', async () => {
    const { subscription, activate, service, advance } = createService();
    await subscription();
    const activation = await activate();
    if (!activation.ok) throw new Error('activation failed');
    const credentials = { licenseId: activation.licenseId, installationId: INSTALL_A, secret: activation.activationSecret };
    const periodEnd = START + 10 * DAY;

    await subscription({ scheduledCancelAt: new Date(periodEnd).toISOString() }, 'subscription.updated');
    const refreshed = await service.refresh(credentials);
    expect(refreshed.ok && refreshed.entitlement.expiresAt).toBe(new Date(periodEnd).toISOString());

    advance(10 * DAY);
    await subscription({ status: 'canceled', canceledAt: new Date(periodEnd).toISOString(), currentPeriodEndsAt: null, scheduledCancelAt: null }, 'subscription.canceled');
    expect(await service.refresh(credentials)).toEqual({ ok: false, error: 'license-inactive' });
  });

  it('grants a grace period while a renewal payment is past due', async () => {
    const { subscription, activate, advance } = createService();
    await subscription();
    await subscription({ status: 'past_due', currentPeriodEndsAt: new Date(START).toISOString() }, 'subscription.past_due');

    const activation = await activate();
    expect(activation.ok && activation.entitlement.status).toBe('grace');
    expect(activation.ok && activation.entitlement.expiresAt).toBe(new Date(START + PAST_DUE_GRACE_MS).toISOString());

    advance(PAST_DUE_GRACE_MS);
    expect(await activate(INSTALL_B)).toMatchObject({ ok: false, error: 'license-inactive' });
  });

  it('ends Pro on a chargeback and restores it when the chargeback is reversed', async () => {
    const { subscription, activate, webhook, service } = createService();
    await subscription();
    const activation = await activate();
    if (!activation.ok) throw new Error('activation failed');
    const credentials = { licenseId: activation.licenseId, installationId: INSTALL_A, secret: activation.activationSecret };
    const adjustment = (action: string, full = true, approved = true) =>
      webhook({ kind: 'adjustment', eventType: 'adjustment.created', action, full, approved, subscriptionId: 'sub_1' });

    await adjustment('refund', false);
    expect((await service.refresh(credentials)).ok).toBe(true);
    await adjustment('refund', true, false);
    expect((await service.refresh(credentials)).ok).toBe(true);

    await adjustment('chargeback');
    expect(await service.refresh(credentials)).toEqual({ ok: false, error: 'license-inactive' });
    await adjustment('chargeback_reverse');
    expect((await service.refresh(credentials)).ok).toBe(true);
    await adjustment('refund');
    expect(await service.refresh(credentials)).toEqual({ ok: false, error: 'license-inactive' });
  });

  it('ignores unsigned webhooks, duplicates and unknown event types', async () => {
    const { service, subscription, webhook, mails, store } = createService();

    expect(await subscription({}, 'subscription.created').then(() => webhook({ kind: 'other', eventType: 'invoice.paid' }))).toEqual({
      status: 200
    });
    const replay = JSON.stringify({
      kind: 'subscription',
      eventId: 'evt_replay',
      eventType: 'subscription.created',
      occurredAt: new Date(START).toISOString(),
      subscription: { customerId: 'ctm_1', subscriptionId: 'sub_2', status: 'active', currentPeriodEndsAt: null, scheduledCancelAt: null, canceledAt: null }
    });
    expect(await service.handleWebhook(replay, 'forged')).toEqual({ status: 401 });
    expect(await store.findBySubscription('paddle', 'sub_2')).toBeNull();

    expect(await service.handleWebhook(replay, 'valid')).toEqual({ status: 200 });
    expect(await service.handleWebhook(replay, 'valid')).toEqual({ status: 200 });
    expect(mails).toHaveLength(2);
  });

  it('lets the provider retry an event whose processing failed', async () => {
    const { service, store } = createService();
    const body = JSON.stringify({
      kind: 'subscription',
      eventId: 'evt_retry',
      eventType: 'subscription.created',
      occurredAt: new Date(START).toISOString(),
      subscription: { customerId: 'ctm_1', subscriptionId: 'sub_9', status: 'active', currentPeriodEndsAt: null, scheduledCancelAt: null, canceledAt: null }
    });
    const apply = vi.spyOn(store, 'applySubscription').mockRejectedValueOnce(new Error('database down'));

    expect(await service.handleWebhook(body, 'valid')).toEqual({ status: 500 });
    expect(await service.handleWebhook(body, 'valid')).toEqual({ status: 200 });
    expect(apply).toHaveBeenCalledTimes(2);
    expect(await store.findBySubscription('paddle', 'sub_9')).not.toBeNull();
  });

  it('keeps the license when the activation email cannot be sent', async () => {
    const { subscription, provider, store, logs } = createService();
    provider.failEmailLookup = true;

    expect(await subscription()).toEqual({ status: 200 });

    expect((await store.findBySubscription('paddle', 'sub_1'))?.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(logs.map((entry) => entry.event)).toContain('activation-mail-failed');
  });

  it('sends a new code for recovery, which replaces the old one', async () => {
    const { subscription, service, mails, lastCode } = createService();
    await subscription();
    const oldCode = lastCode();

    await service.recover(' Kunde@Example.com ');
    await service.recover('fremd@example.com');
    await service.recover('kein-email');

    expect(mails.map((mail) => mail.subject)).toEqual([
      'Dein Aktivierungscode für FlagCount Pro',
      'Neuer Aktivierungscode für FlagCount Pro'
    ]);
    expect(lastCode()).not.toBe(oldCode);
    expect(await service.activate({ code: oldCode, installationId: INSTALL_A })).toMatchObject({ error: 'invalid-code' });
    expect((await service.activate({ code: lastCode(), installationId: INSTALL_A })).ok).toBe(true);
  });

  it('opens the customer portal only for a verified installation', async () => {
    const { subscription, activate, service } = createService();
    await subscription();
    const activation = await activate();
    if (!activation.ok) throw new Error('activation failed');

    expect(
      await service.portal({ licenseId: activation.licenseId, installationId: INSTALL_A, secret: activation.activationSecret })
    ).toEqual({ ok: true, url: 'https://portal.example/ctm_1/sub_1' });
    expect(await service.portal({ licenseId: activation.licenseId, installationId: INSTALL_A, secret: 'nope' })).toEqual({
      ok: false,
      error: 'invalid-installation'
    });
  });

  it('sends the activation code only once the first payment succeeded', async () => {
    const { subscription, mails, store } = createService();

    await subscription({ status: 'incomplete' });
    expect(mails).toHaveLength(0);
    expect((await store.findBySubscription('paddle', 'sub_1'))?.codeHash).toBeNull();

    await subscription({ status: 'active' }, 'subscription.updated');
    await subscription({ status: 'active' }, 'subscription.updated');
    expect(mails.map((mail) => mail.subject)).toEqual(['Dein Aktivierungscode für FlagCount Pro']);
  });

  it('refuses Pro for subscriptions that were never or are no longer paid', async () => {
    const { subscription, activate, advance } = createService();
    await subscription();

    for (const status of ['unpaid', 'incomplete_expired', 'paused']) {
      advance(1000);
      await subscription({ status }, 'subscription.updated');
      expect(await activate()).toMatchObject({ ok: false, error: 'license-inactive' });
    }
  });
});

describe('licenseAccess', () => {
  const NOW = Date.parse('2026-09-14T12:00:00.000Z');
  const base: LicenseRecord = {
    id: 'license-1',
    source: 'stripe',
    providerCustomerId: 'cus_1',
    providerSubscriptionId: 'sub_1',
    providerStatus: 'active',
    currentPeriodEndsAt: null,
    scheduledCancelAt: null,
    canceledAt: null,
    revokedAt: null,
    manualValidUntil: null,
    manualReason: null,
    supportStatus: 'none',
    supportNote: null,
    providerUpdatedAt: '2026-09-14T11:00:00.000Z',
    codeHash: null,
    codeIssuedAt: null,
    createdAt: '2026-09-14T11:00:00.000Z',
    updatedAt: '2026-09-14T11:00:00.000Z'
  };
  const manual: LicenseRecord = {
    ...base,
    source: 'manual',
    providerCustomerId: null,
    providerSubscriptionId: null,
    providerStatus: null,
    providerUpdatedAt: null,
    manualReason: 'creator'
  };

  it('grants manual licenses until their end date', () => {
    expect(licenseAccess(manual, NOW)).toEqual({ status: 'active', endsAt: null });
    expect(licenseAccess({ ...manual, manualValidUntil: new Date(NOW + DAY).toISOString() }, NOW)).toEqual({
      status: 'active',
      endsAt: NOW + DAY
    });
    expect(licenseAccess({ ...manual, manualValidUntil: new Date(NOW).toISOString() }, NOW)).toBeNull();
  });

  it('ends Pro for blocked and revoked licenses of any source', () => {
    expect(licenseAccess({ ...base, supportStatus: 'blocked' }, NOW)).toBeNull();
    expect(licenseAccess({ ...manual, supportStatus: 'blocked' }, NOW)).toBeNull();
    expect(licenseAccess({ ...base, revokedAt: new Date(NOW).toISOString() }, NOW)).toBeNull();
  });

  it('grants past-due subscriptions a grace period after the paid period', () => {
    const paidThrough = NOW - 2 * DAY;
    expect(licenseAccess({ ...base, providerStatus: 'past_due', currentPeriodEndsAt: new Date(paidThrough).toISOString() }, NOW)).toEqual({
      status: 'grace',
      endsAt: paidThrough + PAST_DUE_GRACE_MS
    });
  });
});
