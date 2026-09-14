import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryLicenseStore, type LicenseStore, type SubscriptionUpdate } from './store';

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

  it('processes each webhook event once, unless processing failed', async () => {
    const eventId = `evt_${randomUUID()}`;

    expect(await store.beginWebhookEvent(eventId, 'subscription.created', T0, T1)).toBe('new');
    await store.abandonWebhookEvent(eventId);
    expect(await store.beginWebhookEvent(eventId, 'subscription.created', T0, T1)).toBe('new');
    await store.completeWebhookEvent(eventId, T2);
    expect(await store.beginWebhookEvent(eventId, 'subscription.created', T0, T2)).toBe('duplicate');
  });
});
