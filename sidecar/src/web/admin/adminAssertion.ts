import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Internal proof of an authenticated administrator. The Next.js web container signs one for every admin API
 * request after checking its own session; the backend accepts the request only with a valid, unexpired,
 * unused proof for exactly that method and path. Reaching the backend alone never grants admin rights.
 */
export const ADMIN_ASSERTION_HEADER = 'x-flagcount-admin-assertion';
export const ADMIN_ASSERTION_TTL_MS = 60_000;
export const MIN_ASSERTION_SECRET_LENGTH = 32;
const CLOCK_SKEW_MS = 5_000;
const MAX_TOKEN_LENGTH = 2048;
const SUBJECT_PATTERN = /^github:\d{1,12}$/;

export type AdminAssertionClaims = {
  v: 1;
  /** `github:<account id>` of the signed-in administrator. */
  sub: string;
  login: string;
  method: string;
  path: string;
  iat: number;
  exp: number;
  nonce: string;
};

export type AssertionVerification =
  | { ok: true; claims: AdminAssertionClaims }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' | 'wrong-request' | 'replayed' | 'not-allowed' };

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(`flagcount-admin-assertion.v1.${payload}`).digest('base64url');
}

export function signAdminAssertion(input: {
  subject: string;
  login: string;
  method: string;
  path: string;
  secret: string;
  now?: number;
  nonce?: string;
}): string {
  const now = input.now ?? Date.now();
  const claims: AdminAssertionClaims = {
    v: 1,
    sub: input.subject,
    login: input.login,
    method: input.method.toUpperCase(),
    path: input.path,
    iat: now,
    exp: now + ADMIN_ASSERTION_TTL_MS,
    nonce: input.nonce ?? randomBytes(16).toString('base64url')
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `v1.${payload}.${signature(payload, input.secret)}`;
}

function parseClaims(payload: string): AdminAssertionClaims | null {
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<AdminAssertionClaims>;
    const strings = [value.sub, value.login, value.method, value.path, value.nonce].every((field) => typeof field === 'string' && field.length <= 256);
    const numbers = [value.iat, value.exp].every((field) => typeof field === 'number' && Number.isFinite(field));
    return value.v === 1 && strings && numbers ? (value as AdminAssertionClaims) : null;
  } catch {
    return null;
  }
}

export class AdminAssertionVerifier {
  private readonly seen = new Map<string, number>();
  private readonly now: () => number;

  constructor(
    private readonly options: {
      secret: string;
      /** Subjects (`github:<id>`) that may administer, read on every request. */
      allowedSubjects: () => ReadonlySet<string>;
      now?: () => number;
    }
  ) {
    this.now = options.now ?? Date.now;
  }

  verify(token: unknown, request: { method: string; path: string }): AssertionVerification {
    if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'malformed' };
    const parts = token.split('.');
    const [version, payload, provided] = parts;
    if (parts.length !== 3 || version !== 'v1' || !payload || !provided) return { ok: false, reason: 'malformed' };

    const expected = Buffer.from(signature(payload, this.options.secret));
    const actual = Buffer.from(provided);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return { ok: false, reason: 'bad-signature' };

    const claims = parseClaims(payload);
    if (!claims) return { ok: false, reason: 'malformed' };
    const now = this.now();
    if (claims.exp <= now || claims.iat > now + CLOCK_SKEW_MS || claims.exp - claims.iat > ADMIN_ASSERTION_TTL_MS) {
      return { ok: false, reason: 'expired' };
    }
    if (claims.method !== request.method.toUpperCase() || claims.path !== request.path) return { ok: false, reason: 'wrong-request' };

    for (const [nonce, expiresAt] of this.seen) {
      if (expiresAt <= now) this.seen.delete(nonce);
    }
    if (this.seen.has(claims.nonce)) return { ok: false, reason: 'replayed' };
    this.seen.set(claims.nonce, claims.exp);

    if (!SUBJECT_PATTERN.test(claims.sub) || !this.options.allowedSubjects().has(claims.sub)) return { ok: false, reason: 'not-allowed' };
    return { ok: true, claims };
  }
}

export type AdminApiConfigResult =
  | { kind: 'disabled' }
  | { kind: 'invalid'; problems: string[] }
  | { kind: 'enabled'; config: { secret: string; allowedSubjects: ReadonlySet<string> } };

/** Backend side of the admin API: the shared assertion secret and the allowed GitHub account ids. */
export function readAdminApiConfig(env: Record<string, string | undefined>): AdminApiConfigResult {
  const secret = env['ADMIN_ASSERTION_SECRET']?.trim() ?? '';
  const userIds = env['ADMIN_GITHUB_USER_IDS']?.trim() ?? '';
  if (!secret) return { kind: 'disabled' };

  const problems: string[] = [];
  if (secret.length < MIN_ASSERTION_SECRET_LENGTH) problems.push(`ADMIN_ASSERTION_SECRET must be at least ${MIN_ASSERTION_SECRET_LENGTH} characters`);
  const ids = userIds
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) problems.push('ADMIN_GITHUB_USER_IDS is missing');
  if (ids.some((id) => !/^\d{1,12}$/.test(id))) problems.push('ADMIN_GITHUB_USER_IDS must be numeric GitHub account ids separated by commas');

  return problems.length > 0
    ? { kind: 'invalid', problems }
    : { kind: 'enabled', config: { secret, allowedSubjects: new Set(ids.map((id) => `github:${id}`)) } };
}
