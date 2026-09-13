// Creates a new Ed25519 key pair for signing FlagCount Pro entitlements.
//
//   node scripts/generate-license-keys.mjs 2026-09
//
// The private key goes into the server environment only (LICENSE_SIGNING_PRIVATE_KEY). The public key is
// added to sidecar/src/license/publicKeys.ts and shipped with the next app release, before the server starts
// signing with the new key id. Never commit the private key or paste it into logs or tickets.
import { createPublicKey, generateKeyPairSync } from 'node:crypto';

const keyId = process.argv[2] ?? new Date().toISOString().slice(0, 7);
if (!/^[A-Za-z0-9_-]{1,64}$/.test(keyId)) {
  console.error('The key id may only contain letters, digits, "-" and "_".');
  process.exit(1);
}

const { privateKey } = generateKeyPairSync('ed25519');
const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const publicKey = createPublicKey(privateKey).export({ format: 'jwk' }).x;

console.log('# Server environment (.env on the server, keep secret):');
console.log(`LICENSE_SIGNING_KEY_ID=${keyId}`);
console.log(`LICENSE_SIGNING_PRIVATE_KEY=${Buffer.from(privateKeyPem).toString('base64')}`);
console.log('');
console.log('# App (sidecar/src/license/publicKeys.ts, public):');
console.log(`  '${keyId}': '${publicKey}',`);
