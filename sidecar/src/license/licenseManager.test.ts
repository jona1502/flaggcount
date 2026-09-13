import { describe, expect, it, vi } from 'vitest';
import { FEATURES, type Entitlements } from '../../../shared/entitlements';
import { OFFLINE_GRACE_MS, type SignedEntitlement } from '../../../shared/licensing';
import type { SidecarEvent } from '../protocol';
import { LicenseManager } from './licenseManager';
import { createEntitlementSigner, createEntitlementVerifier, generateSigningKeyPair } from './signature';

const NOW = Date.parse('2026-09-13T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const INSTALLATION = 'installation-0123456789abcdef';
const KEYS = generateSigningKeyPair();
const signer = createEntitlementSigner(KEYS.privateKeyPem, 'k1');

function entitlement(overrides: Partial<SignedEntitlement> = {}): SignedEntitlement {
  return signer.sign({
    version: 1,
    licenseId: 'license-1',
    installationId: INSTALLATION,
    plan: 'pro',
    status: 'active',
    issuedAt: new Date(NOW).toISOString(),
    refreshAfter: new Date(NOW + 7 * DAY).toISOString(),
    expiresAt: new Date(NOW + OFFLINE_GRACE_MS).toISOString(),
    features: [...FEATURES],
    ...overrides
  });
}

type Reply = { status: number; body?: unknown } | 'network';

function createManager(replies: Reply[] = [], keys: Record<string, string> = { k1: KEYS.publicKey }) {
  let now = NOW;
  const events: SidecarEvent[] = [];
  const unlocked: Entitlements[] = [];
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const reply = replies.shift() ?? { status: 500 };
    if (reply === 'network') throw new TypeError('fetch failed');
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status });
  });
  const manager = new LicenseManager({
    send: (event) => events.push(event),
    baseUrl: 'https://license.example/',
    verify: createEntitlementVerifier(keys),
    onEntitlements: (entitlements) => unlocked.push(entitlements),
    fetch,
    now: () => now,
    checkIntervalMs: 60 * 60 * 1000
  });
  const ofType = <T extends SidecarEvent['type']>(type: T) =>
    events.filter((event): event is Extract<SidecarEvent, { type: T }> => event.type === type);
  return { manager, events, unlocked, requests, fetch, ofType, advance: (ms: number) => (now += ms) };
}

const stored = { licenseId: 'license-1', secret: 'secret-of-this-installation' };

describe('LicenseManager', () => {
  it('starts on Free without a license and without any request', async () => {
    const { manager, unlocked, fetch, ofType } = createManager();

    await manager.configure({ installationId: INSTALLATION, credentials: null, entitlement: null });

    expect(manager.getState()).toMatchObject({ plan: 'free', status: 'none', installations: [] });
    expect(unlocked.map((entitlements) => entitlements.plan)).toEqual(['free']);
    expect(ofType('license')).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
    manager.stop();
  });

  it('activates Pro and hands the credentials to Tauri for safe storage', async () => {
    const signed = entitlement();
    const { manager, unlocked, requests, ofType } = createManager([
      { status: 200, body: { licenseId: 'license-1', activationSecret: 'new-secret', entitlement: signed } }
    ]);
    await manager.configure({ installationId: INSTALLATION, credentials: null, entitlement: null });

    await manager.activate('FC-7K2QM-9XH4D-PZ1RT-W8C3N');

    expect(requests[0]).toEqual({
      url: 'https://license.example/api/v1/licenses/activate',
      body: { code: 'FC-7K2QM-9XH4D-PZ1RT-W8C3N', installationId: INSTALLATION }
    });
    expect(manager.getState()).toMatchObject({ plan: 'pro', status: 'active', lastError: null, reference: 'FC-LICENSE1' });
    expect(unlocked.map((entitlements) => entitlements.plan)).toEqual(['free', 'pro']);
    expect(ofType('licenseCredentials')).toEqual([
      { type: 'licenseCredentials', credentials: { licenseId: 'license-1', secret: 'new-secret' }, entitlement: signed }
    ]);
    expect(JSON.stringify(ofType('license'))).not.toContain('new-secret');
    expect(JSON.stringify(ofType('license'))).not.toContain('7K2QM');
    manager.stop();
  });

  it('refuses entitlements this app cannot verify', async () => {
    const { manager, ofType } = createManager(
      [{ status: 200, body: { licenseId: 'license-1', activationSecret: 'new-secret', entitlement: entitlement() } }],
      {}
    );
    await manager.configure({ installationId: INSTALLATION, credentials: null, entitlement: null });

    await manager.activate('FC-7K2QM-9XH4D-PZ1RT-W8C3N');

    expect(manager.getState()).toMatchObject({ plan: 'free', lastError: 'invalid-response' });
    expect(ofType('licenseCredentials')).toEqual([]);
    manager.stop();
  });

  it('lists the other computers when all installations are in use', async () => {
    const installations = [{ installationId: 'installation-other-computer', activatedAt: '2026-09-01T00:00:00.000Z', lastSeenAt: '2026-09-10T00:00:00.000Z' }];
    const { manager, requests } = createManager([
      { status: 409, body: { error: 'installation-limit', installations } },
      { status: 400, body: { error: 'invalid-code' } },
      { status: 403, body: { error: 'license-inactive' } },
      { status: 429, body: { error: 'rate-limited' } },
      'network'
    ]);
    await manager.configure({ installationId: INSTALLATION, credentials: null, entitlement: null });

    await manager.activate('code');
    expect(manager.getState()).toMatchObject({ lastError: 'installation-limit', installations });

    await manager.activate('code', 'installation-other-computer');
    expect(requests[1]?.body).toMatchObject({ replaceInstallationId: 'installation-other-computer' });
    expect(manager.getState()).toMatchObject({ lastError: 'invalid-code', installations: [] });

    for (const expected of ['license-inactive', 'rate-limited', 'network']) {
      await manager.activate('code');
      expect(manager.getState().lastError).toBe(expected);
    }
    manager.stop();
  });

  it('uses a stored entitlement offline and refreshes it once it is due', async () => {
    const { manager, fetch, advance } = createManager(['network', { status: 200, body: { entitlement: entitlement({ issuedAt: new Date(NOW + 8 * DAY).toISOString(), refreshAfter: new Date(NOW + 15 * DAY).toISOString() }) } }]);

    await manager.configure({ installationId: INSTALLATION, credentials: stored, entitlement: entitlement() });
    expect(manager.getState()).toMatchObject({ plan: 'pro', needsRefresh: false });
    expect(fetch).not.toHaveBeenCalled();

    advance(8 * DAY);
    await manager.refresh();
    expect(manager.getState()).toMatchObject({ plan: 'pro', needsRefresh: true, lastError: 'network' });

    await manager.refresh();
    expect(manager.getState()).toMatchObject({ plan: 'pro', needsRefresh: false, lastError: null });
    manager.stop();
  });

  it('refreshes on start when the stored entitlement is missing or expired', async () => {
    const expired = entitlement({ expiresAt: new Date(NOW - 1).toISOString(), issuedAt: new Date(NOW - 31 * DAY).toISOString(), refreshAfter: new Date(NOW - 24 * DAY).toISOString() });
    const { manager, requests } = createManager([{ status: 200, body: { entitlement: entitlement() } }]);

    await manager.configure({ installationId: INSTALLATION, credentials: stored, entitlement: expired });

    expect(requests[0]).toEqual({
      url: 'https://license.example/api/v1/licenses/refresh',
      body: { licenseId: 'license-1', installationId: INSTALLATION, secret: 'secret-of-this-installation' }
    });
    expect(manager.getState().plan).toBe('pro');
    manager.stop();
  });

  it('falls back to Free when the license ends and forgets unknown installations', async () => {
    const { manager, ofType } = createManager([{ status: 403, body: { error: 'license-inactive' } }, { status: 401, body: { error: 'invalid-installation' } }]);
    await manager.configure({ installationId: INSTALLATION, credentials: stored, entitlement: entitlement() });

    await manager.refresh();
    expect(manager.getState()).toMatchObject({ plan: 'free', lastError: 'license-inactive' });
    expect(ofType('licenseCredentials').at(-1)).toEqual({ type: 'licenseCredentials', credentials: stored, entitlement: null });

    await manager.refresh();
    expect(manager.getState()).toMatchObject({ plan: 'free', lastError: 'invalid-installation' });
    expect(ofType('licenseCredentials').at(-1)).toEqual({ type: 'licenseCredentials', credentials: null, entitlement: null });
    manager.stop();
  });

  it('deactivates this computer only after the server confirmed it', async () => {
    const { manager, ofType } = createManager(['network', { status: 204 }]);
    await manager.configure({ installationId: INSTALLATION, credentials: stored, entitlement: entitlement() });

    await manager.deactivate();
    expect(manager.getState()).toMatchObject({ plan: 'pro', lastError: 'network' });

    await manager.deactivate();
    expect(manager.getState()).toMatchObject({ plan: 'free', lastError: null });
    expect(ofType('licenseCredentials').at(-1)).toEqual({ type: 'licenseCredentials', credentials: null, entitlement: null });
    manager.stop();
  });

  it('opens the customer portal through Tauri', async () => {
    const { manager, ofType } = createManager([{ status: 200, body: { url: 'https://customer-portal.paddle.com/cpl_01' } }, { status: 200, body: { url: 'javascript:alert(1)' } }]);
    await manager.configure({ installationId: INSTALLATION, credentials: stored, entitlement: entitlement() });

    await manager.openCustomerPortal();
    await manager.openCustomerPortal();

    expect(ofType('openUrl')).toEqual([{ type: 'openUrl', url: 'https://customer-portal.paddle.com/cpl_01' }]);
    expect(manager.getState().lastError).toBe('unavailable');
    manager.stop();
  });
});
