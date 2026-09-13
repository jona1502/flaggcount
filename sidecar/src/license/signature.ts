import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
import {
  entitlementSigningPayload,
  type EntitlementVerifier,
  type SignedEntitlement,
  type UnsignedEntitlement
} from '../../../shared/licensing';

export type EntitlementSigner = {
  keyId: string;
  sign: (entitlement: Omit<UnsignedEntitlement, 'keyId'>) => SignedEntitlement;
};

/** Signs entitlements with an Ed25519 private key in PKCS#8 PEM. Only the license service holds it. */
export function createEntitlementSigner(privateKeyPem: string, keyId: string): EntitlementSigner {
  const privateKey = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('The license signing key must be an Ed25519 key');
  }
  return {
    keyId,
    sign: (entitlement) => {
      const unsigned: UnsignedEntitlement = { ...entitlement, keyId };
      const signature = sign(null, Buffer.from(entitlementSigningPayload(unsigned)), privateKey).toString('base64url');
      return { ...unsigned, signature };
    }
  };
}

function publicKeyFromRaw(raw: string): KeyObject {
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw }, format: 'jwk' });
}

/** Verifies entitlements against the public keys shipped with the app, as raw base64url keys by key id. */
export function createEntitlementVerifier(publicKeys: Readonly<Record<string, string>>): EntitlementVerifier {
  const keys = new Map(Object.entries(publicKeys).map(([keyId, raw]) => [keyId, publicKeyFromRaw(raw)]));
  return (payload, signature, keyId) => {
    const key = keys.get(keyId);
    if (!key) return false;
    return verify(null, Buffer.from(payload), key, Buffer.from(signature, 'base64url'));
  };
}

/** The raw base64url public key that belongs to a private key, for embedding in the app. */
export function rawPublicKey(privateKeyPem: string): string {
  const jwk = createPublicKey(createPrivateKey(privateKeyPem)).export({ format: 'jwk' });
  if (typeof jwk.x !== 'string') throw new Error('Not an Ed25519 key');
  return jwk.x;
}

export function generateSigningKeyPair(): { privateKeyPem: string; publicKey: string } {
  const { privateKey } = generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  return { privateKeyPem, publicKey: rawPublicKey(privateKeyPem) };
}
