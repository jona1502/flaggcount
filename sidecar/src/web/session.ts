import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'flagcount_session';
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Compares a login attempt with the dashboard password in constant time. */
export function isCorrectPassword(input: unknown, password: string): boolean {
  // Fixed-length digests keep the comparison constant-time for any input length.
  return typeof input === 'string' && timingSafeEqual(digest(input), digest(password));
}

/**
 * Stateless session tokens (`expiry.nonce.signature`), signed with a key derived from the dashboard
 * password. They survive restarts and deploys; changing the password signs every browser out.
 */
export class SessionSigner {
  private readonly key: Buffer;

  constructor(
    password: string,
    private readonly now: () => number,
    private readonly maxAgeMs = SESSION_MAX_AGE_MS
  ) {
    this.key = createHmac('sha256', password).update('flagcount-session-v1').digest();
  }

  create(): string {
    const payload = `${this.now() + this.maxAgeMs}.${randomBytes(16).toString('base64url')}`;
    return `${payload}.${this.sign(payload)}`;
  }

  verify(token: string | undefined): boolean {
    const separator = token?.lastIndexOf('.') ?? -1;
    if (!token || separator < 0) {
      return false;
    }
    const payload = token.slice(0, separator);
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(token.slice(separator + 1));
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return false;
    }
    const expiresAt = Number(payload.split('.')[0]);
    return Number.isFinite(expiresAt) && expiresAt > this.now();
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.key).update(payload).digest('base64url');
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

/** HttpOnly keeps the token away from scripts; SameSite=Strict keeps other sites from using it. */
export function sessionCookie(token: string, maxAgeMs = SESSION_MAX_AGE_MS): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
