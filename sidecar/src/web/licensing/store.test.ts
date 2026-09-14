import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryLicenseStore, referenceKey, type LicenseSearch, type LicenseStore, type SubscriptionUpdate } from './store';

const DATABASE_URL = process.env['TEST_DATABASE_URL'];

type StoreFactory = { name: string; create: () => Promise<LicenseStore>; cleanup: () => Promise<void> };

const factories: StoreFactory[] = [
  { name: 'memory', create: async () => new MemoryLicenseStore(), cleanup: async () => undefined }
];

if (DATABASE_URL) {
  // Runs against a real, disposable database, e.g. `docker compose -f docker-compose.dev.yml up -d`.
  let pool: import('pg').Pool | undefined;
  factories.push({
    name: 'postgres',
    create: async () => {
      const { Pool } = await import('pg');
      const { migrate } = await import('../database/migrations');
      const { PostgresLicenseStore } = await import('./postgresStore');
      pool ??= new Pool({ connectionString: DATABASE_URL });
      await pool.query('DROP TABLE IF EXISTS admin_audit_log, installations, webhook_events, licenses, schema_migrations CASCADE');
      await migrate(pool);
      return new PostgresLicenseStore(pool);
    },
    cleanup: async () => {
      await pool?.end();
    }
  });
}

const T0 = '2026-09-01T10:00:00.000Z';
const T1 = '2026-09-02T10:00:00.000Z';
const T2 = '2026-09-03T10:00:00.000Z';

function update(overrides: Partial<SubscriptionUpdate> = {}): SubscriptionUpdate {
  return {
    provider: 'paddle',
    customerId: 'ctm_1',
    subscriptionId: 'sub_1',
    status: 'active',
    currentPeriodEndsAt: '2026-10-01T10:00:00.000Z',
    scheduledCancelAt: null,
    canceledAt: null,
    occurredAt: T1,
    ...overrides
  };
}

describe.each(factories)('$name license store', (factory) => {
  let store: LicenseStore;

  beforeAll(async () => {
    store = await factory.create();
  });

  afterAll(async () => {
    await factory.cleanup();
  });

  const createLicense = async (subscriptionId = `sub_${randomUUID()}`) =>
    (await store.applySubscription(update({ subscriptionId }), randomUUID, T0)).license;

  it('creates a license once and ignores events older than the stored state', async () => {
    const subscriptionId = `sub_${randomUUID()}`;

    const first = await store.applySubscription(update({ subscriptionId }), randomUUID, T0);
    const newer = await store.applySubscription(update({ subscriptionId, status: 'past_due', occurredAt: T2 }), randomUUID, T0);
    const older = await store.applySubscription(update({ subscriptionId, status: 'canceled', occurredAt: T0 }), randomUUID, T0);

    expect(first).toMatchObject({ created: true, applied: true });
    expect(newer).toMatchObject({ created: false, applied: true, license: { id: first.license.id, providerStatus: 'past_due' } });
    expect(older).toMatchObject({ created: false, applied: false, license: { providerStatus: 'past_due' } });
    expect(await store.findBySubscription('paddle', subscriptionId)).toMatchObject({
      source: 'paddle',
      providerStatus: 'past_due',
      providerUpdatedAt: T2,
      supportStatus: 'none',
      manualReason: null
    });
  });

  it('stores every Stripe subscription status', async () => {
    const subscriptionId = `sub_${randomUUID()}`;
    const statuses = ['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'paused', 'unpaid', 'canceled'] as const;

    for (const [index, status] of statuses.entries()) {
      const occurredAt = new Date(Date.parse(T0) + index * 1000).toISOString();
      const result = await store.applySubscription(update({ provider: 'stripe', subscriptionId, status, occurredAt }), randomUUID, T0);
      expect(result.license.providerStatus).toBe(status);
    }
  });

  it('finds licenses by code hash and customer and stores revocations', async () => {
    const license = await createLicense();
    const hash = randomUUID().replaceAll('-', '');

    await store.setActivationCode(license.id, hash, T1);
    await store.setRevoked(license.id, T2, T2);

    expect(await store.findByCodeHash(hash)).toMatchObject({ id: license.id, codeIssuedAt: T1, revokedAt: T2 });
    expect((await store.findByCustomer('paddle', 'ctm_1')).map((item) => item.id)).toContain(license.id);
    await store.setRevoked(license.id, null, T2);
    expect((await store.findById(license.id))?.revokedAt).toBeNull();
  });

  it('enforces the installation limit and lets an installation be replaced', async () => {
    const license = await createLicense();
    const activate = (installationId: string, replaceInstallationId?: string) =>
      store.activateInstallation({
        licenseId: license.id,
        installationId,
        secretHash: `hash-${installationId}`,
        now: T1,
        maxActive: 3,
        replaceInstallationId
      });

    expect(await activate('device-a')).toBe('activated');
    expect(await activate('device-b')).toBe('activated');
    expect(await activate('device-c')).toBe('activated');
    expect(await activate('device-a')).toBe('activated');
    expect(await activate('device-d')).toBe('limit-reached');
    expect(await activate('device-d', 'device-b')).toBe('activated');

    expect((await store.activeInstallations(license.id)).map((item) => item.installationId).sort()).toEqual([
      'device-a',
      'device-c',
      'device-d'
    ]);
    expect(await store.deactivateInstallation(license.id, 'device-a', T2)).toBe(true);
    expect(await store.deactivateInstallation(license.id, 'device-a', T2)).toBe(false);
    expect(await store.findInstallation(license.id, 'device-a')).toMatchObject({ deactivatedAt: T2 });
  });

  it('creates manual licenses without provider data and searches licenses', async () => {
    const manualId = randomUUID();
    const manual = await store.createManualLicense({ reason: 'creator', validUntil: T2, note: 'Kooperation' }, manualId, T1);
    const paid = await createLicense(`sub_${randomUUID()}`);

    expect(manual).toMatchObject({
      id: manualId,
      source: 'manual',
      providerCustomerId: null,
      providerSubscriptionId: null,
      providerStatus: null,
      providerUpdatedAt: null,
      manualReason: 'creator',
      manualValidUntil: T2,
      supportStatus: 'none',
      supportNote: 'Kooperation'
    });
    const found = async (search: LicenseSearch) => (await store.listLicenses({ search }, { offset: 0, limit: 10 })).items.map((license) => license.id);
    expect(await found({ kind: 'id', value: manualId })).toEqual([manualId]);
    expect(await found({ kind: 'reference', value: referenceKey(manualId) })).toEqual([manualId]);
    expect(await found({ kind: 'subscription', value: paid.providerSubscriptionId ?? '' })).toEqual([paid.id]);
    expect(await found({ kind: 'customer', value: 'ctm_1' })).toContain(paid.id);
    expect((await store.listLicenses({ search: { kind: 'recent' } }, { offset: 0, limit: 1 })).items.length).toBe(1);
  });

  it('filters and pages the license list', async () => {
    const source = `test-${randomUUID().slice(0, 8)}`;
    const ids: string[] = [];
    for (const [index, status] of (['active', 'past_due', 'active'] as const).entries()) {
      const occurredAt = new Date(Date.parse(T0) + index * 1000).toISOString();
      const { license } = await store.applySubscription(update({ provider: source, subscriptionId: `sub_${randomUUID()}`, status, occurredAt }), randomUUID, occurredAt);
      ids.push(license.id);
    }
    await store.updateSupport(ids[0] ?? '', { supportStatus: 'blocked' }, T2);

    const list = (filter: Omit<Parameters<LicenseStore['listLicenses']>[0], 'search'>, offset = 0, limit = 10) =>
      store.listLicenses({ search: { kind: 'recent' }, ...filter }, { offset, limit });

    expect(await list({ source })).toMatchObject({ total: 3 });
    expect((await list({ source, providerStatus: 'active' })).items.map((license) => license.id).sort()).toEqual([ids[0], ids[2]].sort());
    expect((await list({ source, supportStatus: 'blocked' })).items.map((license) => license.id)).toEqual([ids[0]]);
    const firstPage = await list({ source }, 0, 2);
    const secondPage = await list({ source }, 2, 2);
    expect(firstPage).toMatchObject({ total: 3 });
    expect(firstPage.items[0]?.id).toBe(ids[0]);
    expect([...firstPage.items, ...secondPage.items].map((license) => license.id).sort()).toEqual([...ids].sort());
  });

  it('never exceeds the installation limit with parallel activations', async () => {
    const license = await createLicense();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        store.activateInstallation({ licenseId: license.id, installationId: `parallel-${index}`, secretHash: `hash-${index}`, now: T1, maxActive: 3 })
      )
    );

    expect(results.filter((result) => result === 'activated')).toHaveLength(3);
    expect(await store.activeInstallations(license.id)).toHaveLength(3);
  });

  it('lists active and deactivated installations', async () => {
    const license = await createLicense();
    await store.activateInstallation({ licenseId: license.id, installationId: 'device-old', secretHash: 'a', now: T0, maxActive: 3 });
    await store.activateInstallation({ licenseId: license.id, installationId: 'device-new', secretHash: 'b', now: T1, maxActive: 3 });
    await store.deactivateInstallation(license.id, 'device-old', T2);

    expect(await store.installations(license.id)).toMatchObject([
      { installationId: 'device-new', deactivatedAt: null },
      { installationId: 'device-old', deactivatedAt: T2 }
    ]);
  });

  it('changes support fields and manual validity, but never the validity of provider licenses', async () => {
    const paid = await createLicense();
    const manual = await store.createManualLicense({ reason: 'support', validUntil: null, note: null }, randomUUID(), T0);

    expect(await store.updateSupport(paid.id, { supportStatus: 'blocked' }, T1)).toMatchObject({ supportStatus: 'blocked', supportNote: null });
    expect(await store.updateSupport(paid.id, { supportNote: 'Hinweis' }, T2)).toMatchObject({ supportStatus: 'blocked', supportNote: 'Hinweis', updatedAt: T2 });
    expect(await store.updateSupport(paid.id, { supportNote: null }, T2)).toMatchObject({ supportNote: null });
    expect(await store.updateSupport(randomUUID(), { supportStatus: 'none' }, T2)).toBeNull();

    expect(await store.updateManualValidity(manual.id, T2, T1)).toMatchObject({ manualValidUntil: T2 });
    expect(await store.updateManualValidity(paid.id, T2, T1)).toBeNull();
    expect((await store.findById(paid.id))?.manualValidUntil).toBeNull();
  });

  it('keeps the admin audit log per license, newest first', async () => {
    const license = await createLicense();
    const entry = (action: string, createdAt: string) => ({
      id: randomUUID(),
      adminSubject: 'github:1',
      action,
      licenseId: license.id,
      metadata: { installationId: 'device-a', mailed: false, until: null },
      createdAt
    });

    await store.appendAudit(entry('license-blocked', T0));
    await store.appendAudit(entry('license-unblocked', T1));

    expect(await store.listAudit(license.id, 10)).toMatchObject([
      { action: 'license-unblocked', createdAt: T1, metadata: { installationId: 'device-a', mailed: false, until: null } },
      { action: 'license-blocked', createdAt: T0 }
    ]);
    expect(await store.listAudit(license.id, 1)).toHaveLength(1);
  });

  it('processes each webhook event once, unless processing failed', async () => {
    const eventId = `evt_${randomUUID()}`;

    expect(await store.beginWebhookEvent(eventId, 'subscription.created', T0, T1)).toBe('new');
    await store.abandonWebhookEvent(eventId);
    expect(await store.beginWebhookEvent(eventId, 'subscription.created', T0, T1)).toBe('new');
    await store.completeWebhookEvent(eventId, T2);
    expect(await store.beginWebhookEvent(eventId, 'subscription.created', T0, T2)).toBe('duplicate');
  });
});
