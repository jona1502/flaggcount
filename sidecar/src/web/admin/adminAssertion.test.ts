import { describe, expect, it } from 'vitest';
import { ADMIN_ASSERTION_TTL_MS, AdminAssertionVerifier, readAdminApiConfig, signAdminAssertion } from './adminAssertion';
import { emailAdminSubject } from './adminAuth';

const SECRET = 's'.repeat(40);
const NOW = Date.parse('2026-09-14T12:00:00.000Z');

function setup(allowed = new Set(['github:4242'])) {
  let now = NOW;
  const verifier = new AdminAssertionVerifier({ secret: SECRET, allowedSubjects: () => allowed, now: () => now });
  const sign = (overrides: Partial<Parameters<typeof signAdminAssertion>[0]> = {}) =>
    signAdminAssertion({ subject: 'github:4242', login: 'jona', method: 'post', path: '/api/admin/licenses', secret: SECRET, now, ...overrides });
  return { verifier, sign, advance: (ms: number) => (now += ms) };
}

const request = { method: 'POST', path: '/api/admin/licenses' };

describe('admin assertions', () => {
  it('accepts a fresh assertion for exactly the signed request', () => {
    const { verifier, sign } = setup();

    const result = verifier.verify(sign(), request);

    expect(result).toMatchObject({ ok: true, claims: { sub: 'github:4242', login: 'jona', method: 'POST', path: '/api/admin/licenses' } });
  });

  it('rejects forged, tampered and malformed assertions', () => {
    const { verifier, sign } = setup();
    const [version, payload, signature] = sign().split('.');
    const tampered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()), sub: 'github:1' })).toString('base64url');

    expect(verifier.verify(sign({ secret: 'x'.repeat(40) }), request)).toEqual({ ok: false, reason: 'bad-signature' });
    expect(verifier.verify(`${version}.${tampered}.${signature}`, request)).toEqual({ ok: false, reason: 'bad-signature' });
    expect(verifier.verify('v2.abc.def', request)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifier.verify(undefined, request)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifier.verify('x'.repeat(3000), request)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('binds the assertion to method and path', () => {
    const { verifier, sign } = setup();

    expect(verifier.verify(sign(), { method: 'GET', path: '/api/admin/licenses' })).toEqual({ ok: false, reason: 'wrong-request' });
    expect(verifier.verify(sign({ nonce: 'n2' }), { method: 'POST', path: '/api/admin/licenses/x/block' })).toEqual({ ok: false, reason: 'wrong-request' });
  });

  it('expires after a minute and cannot be replayed', () => {
    const { verifier, sign, advance } = setup();
    const token = sign();

    expect(verifier.verify(token, request).ok).toBe(true);
    expect(verifier.verify(token, request)).toEqual({ ok: false, reason: 'replayed' });

    const later = sign({ nonce: 'later' });
    advance(ADMIN_ASSERTION_TTL_MS);
    expect(verifier.verify(later, request)).toEqual({ ok: false, reason: 'expired' });
    expect(verifier.verify(sign({ now: NOW + ADMIN_ASSERTION_TTL_MS + 60_000, nonce: 'future' }), request)).toEqual({ ok: false, reason: 'expired' });
  });

  it('refuses subjects that are not, or no longer, allowed', () => {
    const allowed = new Set(['github:4242']);
    const { verifier, sign } = setup(allowed);

    expect(verifier.verify(sign({ subject: 'github:7' }), request)).toEqual({ ok: false, reason: 'not-allowed' });
    allowed.delete('github:4242');
    expect(verifier.verify(sign({ nonce: 'revoked' }), request)).toEqual({ ok: false, reason: 'not-allowed' });
  });

  it('reads the backend configuration', () => {
    expect(readAdminApiConfig({})).toEqual({ kind: 'disabled' });
    expect(readAdminApiConfig({ ADMIN_ASSERTION_SECRET: SECRET, ADMIN_GITHUB_USER_IDS: '4242, 99' })).toEqual({
      kind: 'enabled',
      config: { secret: SECRET, allowedSubjects: new Set(['github:4242', 'github:99']) }
    });
    expect(readAdminApiConfig({ ADMIN_ASSERTION_SECRET: SECRET, ADMIN_EMAIL: 'Admin@Example.com' })).toEqual({
      kind: 'enabled',
      config: { secret: SECRET, allowedSubjects: new Set([emailAdminSubject('admin@example.com')]) }
    });
    expect(readAdminApiConfig({ ADMIN_ASSERTION_SECRET: 'short', ADMIN_GITHUB_USER_IDS: 'jona' })).toEqual({
      kind: 'invalid',
      problems: ['ADMIN_ASSERTION_SECRET must be at least 32 characters', 'ADMIN_GITHUB_USER_IDS must be numeric GitHub account ids separated by commas']
    });
  });
});
