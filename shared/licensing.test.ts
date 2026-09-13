import { describe, expect, it } from 'vitest';
import { FEATURES, canUse } from './entitlements';
import {
  CLOCK_SKEW_TOLERANCE_MS,
  entitlementSigningPayload,
  evaluateEntitlement,
  licenseReference,
  parseSignedEntitlement,
  type EntitlementVerifier,
  type SignedEntitlement
} from './licensing';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function entitlement(overrides: Partial<SignedEntitlement> = {}): SignedEntitlement {
  return {
    version: 1,
    keyId: 'k1',
    licenseId: '0f5e9c2a-7b1d-4c3e-9a8f-2d6b1e4c7a90',
    installationId: 'install-1',
    plan: 'pro',
    status: 'active',
    issuedAt: new Date(NOW - DAY).toISOString(),
    refreshAfter: new Date(NOW + 6 * DAY).toISOString(),
    expiresAt: new Date(NOW + 29 * DAY).toISOString(),
    features: [...FEATURES],
    signature: 'valid-signature-of-the-test',
    ...overrides
  };
}

/** Accepts exactly the payload of the given entitlement, like a real signature would. */
const signedFor =
  (original: SignedEntitlement): EntitlementVerifier =>
  (payload, signature, keyId) =>
    payload === entitlementSigningPayload(original) && signature === original.signature && keyId === original.keyId;

const evaluate = (value: SignedEntitlement | null, verify: EntitlementVerifier, now = NOW) =>
  evaluateEntitlement(value, { installationId: 'install-1', now, verify });

describe('evaluateEntitlement', () => {
  it('unlocks Pro for a valid entitlement of this installation', () => {
    const valid = entitlement();

    const { info, entitlements } = evaluate(valid, signedFor(valid));

    expect(info).toMatchObject({ plan: 'pro', status: 'active', needsRefresh: false, reference: 'FC-0F5E9C2A7B' });
    expect(canUse(entitlements, 'parallel-counters')).toBe(true);
  });

  it('falls back to Free without an entitlement', () => {
    const { info, entitlements } = evaluate(null, () => true);

    expect(info).toMatchObject({ plan: 'free', status: 'none', reference: null });
    expect(entitlements.plan).toBe('free');
  });

  it('rejects forged, altered and foreign entitlements', () => {
    const original = entitlement();
    const cases = [
      { ...original, expiresAt: new Date(NOW + 365 * DAY).toISOString() },
      { ...original, features: [...FEATURES, 'more'] },
      { ...original, signature: 'another-signature-value' }
    ];
    for (const altered of cases) {
      expect(evaluate(altered, signedFor(original)).info).toMatchObject({ plan: 'free', status: 'invalid' });
    }

    const foreign = entitlement({ installationId: 'other-device' });
    expect(evaluate(foreign, signedFor(foreign)).info.status).toBe('invalid');
    expect(evaluate(original, () => {
      throw new Error('unknown key');
    }).info.status).toBe('invalid');
  });

  it('keeps Pro during the offline grace period and ends it at the expiry', () => {
    const valid = entitlement();
    const expiry = Date.parse(valid.expiresAt);

    expect(evaluate(valid, signedFor(valid), NOW + 10 * DAY).info).toMatchObject({ plan: 'pro', needsRefresh: true });
    expect(evaluate(valid, signedFor(valid), expiry - 1).info.plan).toBe('pro');
    expect(evaluate(valid, signedFor(valid), expiry).info).toMatchObject({ plan: 'free', status: 'expired' });
  });

  it('asks for an online check instead of locking out when the local clock runs behind', () => {
    const valid = entitlement({ issuedAt: new Date(NOW + CLOCK_SKEW_TOLERANCE_MS + 1).toISOString() });

    expect(evaluate(valid, signedFor(valid)).info).toMatchObject({ plan: 'pro', needsRefresh: true });
  });

  it('reports the grace status of a subscription with a failed payment', () => {
    const grace = entitlement({ status: 'grace' });

    expect(evaluate(grace, signedFor(grace)).info).toMatchObject({ plan: 'pro', status: 'grace' });
  });

  it('only grants the features the license lists', () => {
    const limited = entitlement({ features: ['history'] });

    const { info, entitlements } = evaluate(limited, signedFor(limited));

    expect(info.features).toEqual(['history']);
    expect(canUse(entitlements, 'csv-export')).toBe(false);
  });
});

describe('parseSignedEntitlement', () => {
  it('accepts a well-formed entitlement', () => {
    expect(parseSignedEntitlement(JSON.parse(JSON.stringify(entitlement())))).toEqual(entitlement());
  });

  it.each([
    null,
    [],
    { ...entitlement(), version: 2 },
    { ...entitlement(), plan: 'free' },
    { ...entitlement(), status: 'expired' },
    { ...entitlement(), expiresAt: 'soon' },
    { ...entitlement(), features: 'all' },
    { ...entitlement(), licenseId: '../etc' },
    { ...entitlement(), signature: '' }
  ])('rejects %j', (value) => {
    expect(parseSignedEntitlement(value)).toBeNull();
  });
});

describe('licenseReference', () => {
  it('is short and derived from the license id only', () => {
    expect(licenseReference('abc-def')).toBe('FC-ABCDEF');
  });
});
