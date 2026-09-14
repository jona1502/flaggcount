/**
 * Public Ed25519 keys that verify FlagCount Pro entitlements, as raw base64url keys by key id.
 * Create a key pair with `node scripts/generate-license-keys.mjs <key-id>`, add the public key here
 * and ship that app release before the license server signs with the new key id.
 *
 * Without a key, every entitlement is rejected and the app stays on Free.
 */
export const LICENSE_PUBLIC_KEYS: Readonly<Record<string, string>> = Object.freeze({
  '2026-09': 'Q8E57yaOBewaJV3u8Ut_H1f1i05-cf6cTK5VGkqGG7M',
});

/**
 * Sandbox testing only: extra keys as JSON in `FLAGCOUNT_LICENSE_PUBLIC_KEYS`. Local keys can at most
 * unlock local features on this computer; the server still decides about everything online.
 */
export function licensePublicKeys(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const keys: Record<string, string> = { ...LICENSE_PUBLIC_KEYS };
  const extra = env['FLAGCOUNT_LICENSE_PUBLIC_KEYS'];
  if (!extra) return keys;
  try {
    const parsed: unknown = JSON.parse(extra);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      for (const [keyId, key] of Object.entries(parsed)) {
        if (/^[A-Za-z0-9_-]{1,64}$/.test(keyId) && typeof key === 'string' && /^[A-Za-z0-9_-]{43}$/.test(key)) {
          keys[keyId] = key;
        }
      }
    }
  } catch {
    // Ignore a malformed value; the shipped keys still apply.
  }
  return keys;
}
