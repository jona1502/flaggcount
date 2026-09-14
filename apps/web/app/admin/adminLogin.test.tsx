// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAssertionVerifier } from '../../../../sidecar/src/web/admin/adminAssertion';
import { ADMIN_IDLE_TIMEOUT_MS, AdminSessions, type AdminConfig } from '../../../../sidecar/src/web/admin/adminAuth';
import { RateLimiter } from '../../../../sidecar/src/web/licensing/rateLimiter';
import type { LogFields } from '../../../../sidecar/src/web/structuredLog';

const cookieJar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined) }),
  headers: async () => new Headers({ 'x-forwarded-for': '198.51.100.7' })
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  }
}));

const { finishLogin, isSameOrigin, logout, passwordLogin, startLogin, visitorKey } = await import('../../lib/admin/authFlow');
const { adminBackend } = await import('../../lib/admin/backend');
const { createAdminRuntime, setAdminRuntime } = await import('../../lib/admin/runtime');
const { currentAdmin, requireAdmin } = await import('../../lib/admin/session');
const { GET: loginRoute } = await import('./auth/login/route');
const { default: AdminLoginPage } = await import('./login/page');
const { default: ProtectedAdminLayout } = await import('./(protected)/layout');

const SECRET = 'z'.repeat(40);
const BASE = 'https://flagcount.example';
let now = Date.parse('2026-09-14T10:00:00.000Z');
const logs: { event: string; fields?: LogFields }[] = [];

function runtime(allowed = new Set(['4242'])) {
  const config: AdminConfig = { clientId: 'Ov23liAbCdEfGh123456', clientSecret: 'c'.repeat(40), allowedUserIds: allowed, publicBaseUrl: BASE };
  return {
    config,
    sessions: new AdminSessions(() => now),
    oauth: {
      authorizeUrl: (state: string, challenge: string) => `https://github.com/login/oauth/authorize?state=${state}&code_challenge=${challenge}`,
      identify: vi.fn(async (code: string) => {
        if (code === 'allowed') return { id: '4242', login: 'jona' };
        if (code === 'stranger') return { id: '7', login: 'someone' };
        throw new TypeError('github down');
      })
    },
    assertionSecret: SECRET,
    loginLimiter: new RateLimiter({ limit: 20, windowMs: 15 * 60_000, now: () => now }),
    logger: (_level: 'info' | 'warn' | 'error', event: string, fields?: LogFields) => void logs.push({ event, fields })
  };
}

const cookiesOf = (response: Response) => response.headers.getSetCookie();
const cookieValue = (response: Response, name: string) =>
  cookiesOf(response).map((cookie) => cookie.split(';')[0] ?? '').find((cookie) => cookie.startsWith(`${name}=`))?.slice(name.length + 1);

async function signIn(active: ReturnType<typeof runtime>, code = 'allowed') {
  const started = startLogin(active, new Request(`${BASE}/admin/auth/login`));
  const state = new URL(started.headers.get('location') ?? '').searchParams.get('state') ?? '';
  const loginCookie = cookieValue(started, '__Host-flagcount_admin_login') ?? '';
  const callback = await finishLogin(
    active,
    new Request(`${BASE}/admin/auth/callback?code=${code}&state=${state}`, { headers: { cookie: `__Host-flagcount_admin_login=${loginCookie}` } })
  );
  return { started, state, loginCookie, callback, token: cookieValue(callback, '__Host-flagcount_admin') };
}

beforeEach(() => {
  now = Date.parse('2026-09-14T10:00:00.000Z');
  logs.length = 0;
  cookieJar.clear();
});

afterEach(() => {
  setAdminRuntime(undefined);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('admin login flow', () => {
  it('signs in the configured e-mail only with the correct password', async () => {
    const active = runtime();
    active.config.email = 'admin@example.com';
    active.config.password = 'a-secure-password';
    const attempt = (email: string, password: string) =>
      passwordLogin(
        active,
        new Request(`${BASE}/admin/auth/login`, {
          method: 'POST',
          headers: { origin: BASE, host: 'flagcount.example' },
          body: new URLSearchParams({ email, password })
        })
      );

    expect((await attempt('admin@example.com', 'wrong-password')).status).toBe(401);
    const signedIn = await attempt('ADMIN@example.com', 'a-secure-password');
    expect(signedIn.status).toBe(303);
    expect(signedIn.headers.get('location')).toBe('/admin');
    expect(cookieValue(signedIn, '__Host-flagcount_admin')).toMatch(/^[\w-]{43}$/);
  });

  it('starts the GitHub login with state, PKCE and a lax login cookie', () => {
    const { started } = { started: startLogin(runtime(), new Request(`${BASE}/admin/auth/login`)) };

    expect(started.status).toBe(302);
    expect(started.headers.get('location')).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?state=[\w-]{43}&code_challenge=[\w-]{43}$/);
    expect(cookiesOf(started)[0]).toMatch(/^__Host-flagcount_admin_login=[\w-]{43}; Path=\/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/);
    expect(started.headers.get('cache-control')).toBe('no-store');
  });

  it('creates a strict session cookie for allowed accounts only', async () => {
    const active = runtime();

    const { callback, token } = await signIn(active);
    expect(callback.status).toBe(200);
    expect(await callback.text()).toContain('http-equiv="refresh" content="0;url=/admin"');
    expect(callback.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(cookiesOf(callback).find((cookie) => cookie.startsWith('__Host-flagcount_admin='))).toMatch(/HttpOnly; Secure; SameSite=Strict$/);
    expect(token).toMatch(/^[\w-]{43}$/);

    const stranger = await signIn(active, 'stranger');
    expect(stranger.callback.status).toBe(403);
    expect(stranger.token).toBeUndefined();
    expect((await signIn(active, 'unreachable')).callback.status).toBe(502);
    expect(logs.map((entry) => entry.fields?.['reason'] ?? entry.event)).toEqual(['admin-signed-in', 'not-allowed', 'admin-login-failed']);
  });

  it('refuses foreign and reused login states', async () => {
    const active = runtime();
    const { state, loginCookie } = { ...(await (async () => {
      const started = startLogin(active, new Request(`${BASE}/admin/auth/login`));
      return { state: new URL(started.headers.get('location') ?? '').searchParams.get('state') ?? '', loginCookie: cookieValue(started, '__Host-flagcount_admin_login') ?? '' };
    })()) };
    const callback = (cookie: string) => finishLogin(active, new Request(`${BASE}/admin/auth/callback?code=allowed&state=${state}`, { headers: { cookie } }));

    expect((await callback('__Host-flagcount_admin_login=foreign')).status).toBe(400);
    expect((await callback(`__Host-flagcount_admin_login=${loginCookie}`)).status).toBe(200);
    expect((await callback(`__Host-flagcount_admin_login=${loginCookie}`)).status).toBe(400);
  });

  it('rate-limits login attempts per visitor', () => {
    const active = runtime();
    const attempt = (address: string) => startLogin(active, new Request(`${BASE}/admin/auth/login`, { headers: { 'x-forwarded-for': `${address}, 172.18.0.2` } }));

    for (let index = 0; index < 20; index++) expect(attempt('198.51.100.7').status).toBe(302);
    expect(attempt('198.51.100.7').status).toBe(429);
    expect(attempt('198.51.100.8').status).toBe(302);
    expect(visitorKey(new Request(BASE, { headers: { 'x-forwarded-for': '1.2.3.4, 198.51.100.9, 10.0.0.2' } }))).toBe('198.51.100.9');
  });

  it('logs out only with a same-origin post and the CSRF token', async () => {
    const active = runtime();
    const { token } = await signIn(active);
    const session = active.sessions.verify(token);
    const post = (headers: Record<string, string>, csrfToken?: string) =>
      logout(
        active,
        new Request(`${BASE}/admin/auth/logout`, {
          method: 'POST',
          headers: { cookie: `__Host-flagcount_admin=${token}`, host: 'flagcount.example', ...headers },
          body: new URLSearchParams(csrfToken === undefined ? {} : { csrfToken })
        })
      );

    expect((await post({})).status).toBe(403);
    expect((await post({ origin: 'https://evil.example' }, session?.csrfToken)).status).toBe(403);
    expect((await post({ origin: BASE }, 'wrong')).status).toBe(403);
    const signedOut = await post({ origin: BASE }, session?.csrfToken);
    expect(signedOut.status).toBe(303);
    expect(signedOut.headers.get('location')).toBe('/admin/login');
    expect(cookiesOf(signedOut)[0]).toContain('Max-Age=0');
    expect(active.sessions.verify(token)).toBeNull();
    expect(isSameOrigin(new Request(BASE, { headers: { origin: BASE, 'x-forwarded-host': 'flagcount.example', host: 'web:3000' } }))).toBe(true);
  });
});

describe('admin session guard', () => {
  it('knows the administrator of a request and ends revoked sessions', async () => {
    const allowed = new Set(['4242']);
    const active = runtime(allowed);
    const { token } = await signIn(active);

    expect(await currentAdmin(active)).toBeNull();
    cookieJar.set('__Host-flagcount_admin', token ?? '');
    expect(await currentAdmin(active)).toMatchObject({ subject: 'github:4242', login: 'jona', csrfToken: expect.stringMatching(/^[\w-]{43}$/) });

    allowed.delete('4242');
    expect(await currentAdmin(active)).toBeNull();
    allowed.add('4242');
    expect(await currentAdmin(active)).toBeNull();
  });

  it('expires idle sessions', async () => {
    const active = runtime();
    const { token } = await signIn(active);
    cookieJar.set('__Host-flagcount_admin', token ?? '');

    now += ADMIN_IDLE_TIMEOUT_MS + 1;

    expect(await currentAdmin(active)).toBeNull();
  });

  it('redirects to the login without a session and renders nothing protected', async () => {
    setAdminRuntime(runtime());

    await expect(requireAdmin()).rejects.toThrow('redirect:/admin/login');
    await expect(ProtectedAdminLayout({ children: 'geheim' })).rejects.toThrow('redirect:/admin/login');
  });

  it('renders the protected layout with the logout form for an administrator', async () => {
    const active = runtime();
    setAdminRuntime(active);
    const { token } = await signIn(active);
    cookieJar.set('__Host-flagcount_admin', token ?? '');

    const html = renderToStaticMarkup(await ProtectedAdminLayout({ children: 'Inhalt' }));

    expect(html).toContain('Angemeldet als jona');
    expect(html).toContain('action="/admin/auth/logout"');
    expect(html).toContain(`name="csrfToken" value="${active.sessions.verify(token)?.csrfToken}"`);
    expect(html).toContain('Inhalt');
  });

  it('shows the login page, or that the admin area is not set up', async () => {
    setAdminRuntime(runtime());
    expect(renderToStaticMarkup(await AdminLoginPage())).toContain('href="/admin/auth/login"');

    setAdminRuntime(null);
    expect(renderToStaticMarkup(await AdminLoginPage())).toContain('nicht eingerichtet');
    expect(loginRoute(new Request(`${BASE}/admin/auth/login`)).status).toBe(404);
  });

  it('builds the runtime only with a complete configuration', () => {
    const env = {
      ADMIN_GITHUB_CLIENT_ID: 'Ov23liAbCdEfGh123456',
      ADMIN_GITHUB_CLIENT_SECRET: 'c'.repeat(40),
      ADMIN_GITHUB_USER_IDS: '4242',
      PUBLIC_BASE_URL: BASE,
      ADMIN_ASSERTION_SECRET: SECRET
    };

    expect(createAdminRuntime(env)).not.toBeNull();
    expect(createAdminRuntime({ ...env, ADMIN_ASSERTION_SECRET: 'short' })).toBeNull();
    expect(createAdminRuntime({ ...env, ADMIN_GITHUB_CLIENT_SECRET: undefined })).toBeNull();
    expect(createAdminRuntime({ ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORT: 'a-secure-password', ADMIN_ASSERTION_SECRET: SECRET })).not.toBeNull();
    expect(createAdminRuntime({ ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORT: 'short', ADMIN_ASSERTION_SECRET: SECRET })).toBeNull();
  });
});

describe('admin backend client', () => {
  it('signs every request so the backend verifier accepts exactly that request', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://server:3010');
    const verifier = new AdminAssertionVerifier({ secret: SECRET, allowedSubjects: () => new Set(['github:4242']) });
    const fetcher = vi.fn(async (url: URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      const verification = verifier.verify(headers['x-flagcount-admin-assertion'], { method: init?.method ?? 'GET', path: url.pathname });
      return new Response(JSON.stringify(verification.ok ? { subject: verification.claims.sub } : { error: verification.reason }), {
        status: verification.ok ? 200 : 401
      });
    });
    vi.stubGlobal('fetch', fetcher);
    const admin = { subject: 'github:4242', login: 'jona' };

    const result = await adminBackend<{ subject: string }>(admin, 'POST', '/api/admin/licenses?q=x', { body: { reason: 'support' }, forwardedFor: '198.51.100.7', secret: SECRET });

    expect(result).toEqual({ ok: true, status: 200, data: { subject: 'github:4242' } });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://server:3010/api/admin/licenses?q=x');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.7' });
    expect(init?.body).toBe(JSON.stringify({ reason: 'support' }));
    expect(await adminBackend(admin, 'GET', '/api/admin/whoami', { secret: 'w'.repeat(40) })).toEqual({ ok: false, status: 401, error: 'bad-signature' });
  });

  it('reports an unreachable backend and a missing configuration', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    const admin = { subject: 'github:4242', login: 'jona' };

    expect(await adminBackend(admin, 'GET', '/api/admin/whoami', { secret: SECRET })).toEqual({ ok: false, status: 503, error: 'backend-unreachable' });
    setAdminRuntime(null);
    expect(await adminBackend(admin, 'GET', '/api/admin/whoami')).toEqual({ ok: false, status: 503, error: 'admin-unavailable' });
  });
});
