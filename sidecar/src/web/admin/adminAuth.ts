import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** GitHub OAuth app of the admin login and the GitHub accounts allowed to use it. */
export type AdminConfig = {
  clientId: string;
  clientSecret: string;
  /** Numeric GitHub account ids; ids never change, unlike user names. */
  allowedUserIds: ReadonlySet<string>;
  /** Public origin of the website, for the OAuth callback. */
  publicBaseUrl: string;
};

export type AdminConfigResult = { kind: 'disabled' } | { kind: 'invalid'; problems: string[] } | { kind: 'enabled'; config: AdminConfig };

export const ADMIN_VARIABLES = ['ADMIN_GITHUB_CLIENT_ID', 'ADMIN_GITHUB_CLIENT_SECRET', 'ADMIN_GITHUB_USER_IDS'] as const;

/** `__Host-` cookies must be Secure, have `Path=/` and no domain, so no subdomain can set or read them. */
export const ADMIN_SESSION_COOKIE = '__Host-flagcount_admin';
export const ADMIN_LOGIN_COOKIE = '__Host-flagcount_admin_login';
export const ADMIN_IDLE_TIMEOUT_MS = 30 * 60_000;
export const ADMIN_MAX_SESSION_MS = 8 * 60 * 60_000;
export const ADMIN_LOGIN_TTL_MS = 10 * 60_000;
const MAX_SESSIONS = 20;
const MAX_PENDING_LOGINS = 100;

/**
 * Reads the admin login configuration. Without any of its variables the admin area does not exist.
 * There is deliberately no shared admin password, and the dashboard password is never reused.
 */
export function readAdminConfig(env: Record<string, string | undefined>): AdminConfigResult {
  const value = (name: string): string => env[name]?.trim() ?? '';
  if (ADMIN_VARIABLES.every((name) => value(name) === '')) return { kind: 'disabled' };

  const problems: string[] = [];
  const required = (name: string): string => {
    const found = value(name);
    if (!found) problems.push(`${name} is missing`);
    return found;
  };
  const clientId = required('ADMIN_GITHUB_CLIENT_ID');
  const clientSecret = required('ADMIN_GITHUB_CLIENT_SECRET');
  const userIds = required('ADMIN_GITHUB_USER_IDS');
  const publicBaseUrl = required('PUBLIC_BASE_URL').replace(/\/+$/, '');

  if (clientId && !/^[A-Za-z0-9._-]{8,64}$/.test(clientId)) problems.push('ADMIN_GITHUB_CLIENT_ID has an invalid format');
  if (clientSecret && !/^[A-Za-z0-9_]{20,128}$/.test(clientSecret)) problems.push('ADMIN_GITHUB_CLIENT_SECRET has an invalid format');

  const allowedUserIds = new Set(
    userIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
  if (userIds && [...allowedUserIds].some((id) => !/^\d{1,12}$/.test(id))) {
    problems.push('ADMIN_GITHUB_USER_IDS must be numeric GitHub account ids separated by commas');
  }

  if (publicBaseUrl) {
    let url: URL | null = null;
    try {
      url = new URL(publicBaseUrl);
    } catch {
      // Reported below.
    }
    const local = url?.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (!url || (url.protocol !== 'https:' && !local) || url.pathname !== '/' || url.search || url.hash) {
      problems.push('PUBLIC_BASE_URL must be an https origin without a path');
    }
  }

  return problems.length > 0
    ? { kind: 'invalid', problems }
    : { kind: 'enabled', config: { clientId, clientSecret, allowedUserIds, publicBaseUrl } };
}

export type AdminSession = {
  /** `github:<account id>`, recorded in the audit log. */
  subject: string;
  login: string;
  csrfToken: string;
  createdAt: number;
  lastSeenAt: number;
};

const token = (bytes = 32): string => randomBytes(bytes).toString('base64url');
const digest = (value: string): string => createHash('sha256').update(value).digest('base64url');

export function safeEqual(actual: unknown, expected: string): boolean {
  if (typeof actual !== 'string') return false;
  const a = createHash('sha256').update(actual).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b) && actual.length === expected.length;
}

/**
 * Server-side admin sessions, kept in memory: a restart signs admins out, which is acceptable for a
 * short-lived support login. The cookie holds only a random token; the map is keyed by its hash.
 */
export class AdminSessions {
  private readonly sessions = new Map<string, AdminSession>();
  private readonly logins = new Map<string, { verifier: string; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Starts a GitHub login: `state` binds the callback to this browser, the PKCE verifier to this server. */
  beginLogin(): { state: string; challenge: string } {
    this.prune();
    if (this.logins.size >= MAX_PENDING_LOGINS) {
      const oldest = this.logins.keys().next().value;
      if (oldest !== undefined) this.logins.delete(oldest);
    }
    const state = token();
    const verifier = token(48);
    this.logins.set(state, { verifier, expiresAt: this.now() + ADMIN_LOGIN_TTL_MS });
    return { state, challenge: createHash('sha256').update(verifier).digest('base64url') };
  }

  /** The PKCE verifier of a pending login; every state can be used once. */
  finishLogin(state: unknown): string | null {
    if (typeof state !== 'string') return null;
    const login = this.logins.get(state);
    this.logins.delete(state);
    return login && login.expiresAt > this.now() ? login.verifier : null;
  }

  create(subject: string, login: string): { token: string; session: AdminSession } {
    this.prune();
    if (this.sessions.size >= MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value;
      if (oldest !== undefined) this.sessions.delete(oldest);
    }
    const sessionToken = token();
    const now = this.now();
    const session: AdminSession = { subject, login, csrfToken: token(), createdAt: now, lastSeenAt: now };
    this.sessions.set(digest(sessionToken), session);
    return { token: sessionToken, session };
  }

  /** The session of a cookie token, extending its idle time; `null` once idle or too old. */
  verify(sessionToken: string | undefined): AdminSession | null {
    if (!sessionToken || sessionToken.length > 128) return null;
    const key = digest(sessionToken);
    const session = this.sessions.get(key);
    if (!session) return null;
    const now = this.now();
    if (now - session.lastSeenAt > ADMIN_IDLE_TIMEOUT_MS || now - session.createdAt > ADMIN_MAX_SESSION_MS) {
      this.sessions.delete(key);
      return null;
    }
    session.lastSeenAt = now;
    return session;
  }

  expiresAt(session: AdminSession): number {
    return Math.min(session.lastSeenAt + ADMIN_IDLE_TIMEOUT_MS, session.createdAt + ADMIN_MAX_SESSION_MS);
  }

  destroy(sessionToken: string | undefined): void {
    if (sessionToken) this.sessions.delete(digest(sessionToken));
  }

  private prune(): void {
    const now = this.now();
    for (const [key, session] of this.sessions) {
      if (now - session.lastSeenAt > ADMIN_IDLE_TIMEOUT_MS || now - session.createdAt > ADMIN_MAX_SESSION_MS) this.sessions.delete(key);
    }
    for (const [state, login] of this.logins) {
      if (login.expiresAt <= now) this.logins.delete(state);
    }
  }
}

export function adminSessionCookie(value: string): string {
  return `${ADMIN_SESSION_COOKIE}=${value}; Path=/; Max-Age=${ADMIN_MAX_SESSION_MS / 1000}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearedAdminSessionCookie(): string {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

/** Lax, because GitHub's redirect back to the callback is a cross-site navigation. */
export function adminLoginCookie(state: string): string {
  return `${ADMIN_LOGIN_COOKIE}=${state}; Path=/; Max-Age=${ADMIN_LOGIN_TTL_MS / 1000}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearedAdminLoginCookie(): string {
  return `${ADMIN_LOGIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/** A GitHub request failed; the response body is not kept. */
export class GitHubOAuthError extends Error {
  constructor(readonly step: 'token' | 'user') {
    super(`GitHub ${step} request failed`);
    this.name = 'GitHubOAuthError';
  }
}

/** Sign-in with GitHub (OAuth web application flow with PKCE). No scope: only the public profile is read. */
export class GitHubOAuth {
  private readonly send: typeof fetch;

  constructor(
    private readonly config: AdminConfig,
    options: { fetch?: typeof fetch; timeoutMs?: number } = {}
  ) {
    this.send = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  private readonly timeoutMs: number;

  get redirectUri(): string {
    return `${this.config.publicBaseUrl}/admin/auth/callback`;
  }

  authorizeUrl(state: string, challenge: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      allow_signup: 'false'
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /** Exchanges the callback code and reads the GitHub account behind it. */
  async identify(code: string, verifier: string): Promise<{ id: string; login: string }> {
    const tokenResponse = await this.send('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: this.redirectUri,
        code_verifier: verifier
      }).toString(),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    const tokenBody = (await tokenResponse.json().catch(() => null)) as { access_token?: unknown } | null;
    const accessToken = tokenBody?.access_token;
    if (!tokenResponse.ok || typeof accessToken !== 'string' || !accessToken) throw new GitHubOAuthError('token');

    const userResponse = await this.send('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'FlagCount-Admin'
      },
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    const user = (await userResponse.json().catch(() => null)) as { id?: unknown; login?: unknown } | null;
    if (!userResponse.ok || typeof user?.id !== 'number' || typeof user.login !== 'string') throw new GitHubOAuthError('user');
    return { id: String(user.id), login: user.login };
  }
}
