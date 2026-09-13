import { describe, expect, it } from 'vitest';
import { FEATURES } from '../../../shared/entitlements';
import { createEntitlementSigner, createEntitlementVerifier, generateSigningKeyPair } from '../license/signature';
import { acceptsBoardEntitlement } from './boardEntitlement';

describe('acceptsBoardEntitlement', () => {
  it('accepts only authentic, current Pro entitlements with parallel counters', () => {
    const now = Date.parse('2026-09-13T12:00:00.000Z');
    const keys = generateSigningKeyPair();
    const signer = createEntitlementSigner(keys.privateKeyPem, 'key-1');
    const verify = createEntitlementVerifier({ 'key-1': keys.publicKey });
    const entitlement = signer.sign({
      version: 1,
      licenseId: 'license-1',
      installationId: 'installation-1',
      plan: 'pro',
      status: 'active',
      issuedAt: '2026-09-13T10:00:00.000Z',
      refreshAfter: '2026-09-14T10:00:00.000Z',
      expiresAt: '2026-10-13T10:00:00.000Z',
      features: [...FEATURES]
    });

    expect(acceptsBoardEntitlement(entitlement, verify, () => now)).toBe(true);
    expect(acceptsBoardEntitlement({ ...entitlement, signature: 'a'.repeat(86) }, verify, () => now)).toBe(false);
    expect(acceptsBoardEntitlement(entitlement, verify, () => Date.parse('2026-11-01T00:00:00.000Z'))).toBe(false);
    expect(acceptsBoardEntitlement(signer.sign({ ...entitlement, features: [] }), verify, () => now)).toBe(false);
  });
});
