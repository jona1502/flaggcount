import { createServer, request as httpRequest, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEntitlementSigner, generateSigningKeyPair } from '../../license/signature';
import { AdminService } from '../licensing/adminService';
import type { BillingProvider } from '../licensing/billing';
import { LicenseService } from '../licensing/licenseService';
import { MemoryLicenseStore } from '../licensing/store';
import type { LogFields } from '../structuredLog';
import { ADMIN_IDLE_TIMEOUT_MS, AdminSessions, type AdminConfig } from './adminAuth';
import { ADMIN_PATHS, CSRF_HEADER, createAdminHandler, type AdminHandlerOptions } from './adminRoutes';

const KEYS = generateSigningKeyPair();
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

const CONFIG: AdminConfig = {
  clientId: 'Ov23liAbCdEfGh123456',
  clientSecret: '0123456789abcdef0123456789abcdef01234567',
  allowedUserIds: new Set(['4242']),
  publicBaseUrl: 'https://flagcount.example'
};

const provider: BillingProvider = {
  name: 'stripe',
  verifyWebhook: () => ({ ok: false, reason: 'invalid-signature' }),
  createCheckout: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' }),
  createPortalSession: async () => ({ url: 'https://billing.stripe.com/p/session/test_1' }),
  customerEmail: async () => null,
  customerIdsByEmail: async () => [],
  previewPrices: async () => []
};

async function start(overrides: Partial<AdminHandlerOptions> = {}) {
  let now = Date.parse('2026-09-14T10:00:00.000Z');
  const clock = () => now;
  const store = new MemoryLicenseStore();
  const logs: { event: string; fields?: LogFields }[] = [];
  const logger = (_level: string, event: string, fields?: LogFields) => void logs.push({ event, fields });
  const licenses = new LicenseService({
    store,
    provider,
    signer: createEntitlementSigner(KEYS.privateKeyPem, 'k1'),
    mailer: { send: async () => undefined },
    codePepper: 'pepper',
    supportEmail: 'support@example.com',
    logger,
    now: clock
  });
  const admin = new AdminService({ store, licenses, logger, stripeMode: 'test', now: clock });
  const sessions = new AdminSessions(clock);
  const identify = vi.fn(async (code: string) => {
    if (code === 'allowed') return { id: '4242', login: 'jona' };
    if (code === 'stranger') return { id: '7', login: 'someone' };
    throw new TypeError('github down');
  });
  const handler = createAdminHandler({
    config: CONFIG,
    sessions,
    oauth: { authorizeUrl: (state, challenge) => `https://github.com/login/oauth/authorize?state=${state}&code_challenge=${challenge}`, identify },
    admin: () => admin,
    logger,
    clientAddress: () => '203.0.113.5',
    now: clock,
    ...overrides
  });
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    void handler.handle(pathname, request, response).then((handled) => {
      if (!handled) {
        response.statusCode = 404;
        response.end('not admin');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return { port: (server.address() as AddressInfo).port, logs, identify, advance: (ms: number) => (now += ms) };
}

type Response = { status: number; body: string; headers: IncomingHttpHeaders };

function send(port: number, path: string, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { host: '127.0.0.1', port, path, method: options.method ?? 'GET', headers: options.headers, agent: false },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => (text += chunk));
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text, headers: response.headers }));
      }
    );
    request.on('error', reject);
    request.end(options.body === undefined ? undefined : JSON.stringify(options.body));
  });
}

const cookieValue = (headers: IncomingHttpHeaders, name: string): string | undefined =>
  (headers['set-cookie'] ?? []).map((cookie) => cookie.split(';')[0] ?? '').find((cookie) => cookie.startsWith(`${name}=`));

/** Runs the GitHub login and returns the session cookie and CSRF token. */
async function signIn(port: number, code = 'allowed') {
  const login = await send(port, ADMIN_PATHS.login);
  const stateCookie = cookieValue(login.headers, '__Host-flagcount_admin_login') ?? '';
  const state = new URL(login.headers.location ?? '').searchParams.get('state') ?? '';
  const callback = await send(port, `${ADMIN_PATHS.callback}?code=${code}&state=${state}`, { headers: { cookie: stateCookie } });
  const cookie = cookieValue(callback.headers, '__Host-flagcount_admin') ?? '';
  const session = await send(port, ADMIN_PATHS.session, { headers: { cookie } });
  return { login, callback, cookie, csrfToken: (JSON.parse(session.body) as { csrfToken?: string }).csrfToken ?? '' };
}

const change = (cookie: string, csrfToken: string, body: unknown) => ({
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
  body
});

describe('admin routes', () => {
  it('ignores paths outside the admin area', async () => {
    const { port } = await start();

    expect((await send(port, '/api/state')).body).toBe('not admin');
    expect((await send(port, '/admin')).body).toBe('not admin');
  });

  it('signs in allowed GitHub accounts with a strict, host-only session cookie', async () => {
    const { port, logs } = await start();

    const { login, callback, cookie, csrfToken } = await signIn(port);

    expect(login.status).toBe(302);
    expect(login.headers.location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?state=[\w-]{43}&code_challenge=[\w-]{43}$/);
    expect(login.headers['set-cookie']?.[0]).toContain('SameSite=Lax');
    expect(callback.status).toBe(200);
    expect(callback.body).toContain('http-equiv="refresh"');
    expect(callback.headers['content-security-policy']).toContain("default-src 'none'");
    expect(callback.headers['set-cookie']?.find((value) => value.startsWith('__Host-flagcount_admin='))).toMatch(/HttpOnly; Secure; SameSite=Strict$/);
    expect(cookie).toMatch(/^__Host-flagcount_admin=[\w-]{43}$/);
    expect(csrfToken).toMatch(/^[\w-]{43}$/);
    expect(logs.map((entry) => entry.event)).toContain('admin-signed-in');
  });

  it('refuses other accounts, foreign states and replayed callbacks', async () => {
    const { port } = await start();

    const stranger = await signIn(port, 'stranger');
    expect(stranger.callback.status).toBe(403);
    expect(stranger.cookie).toBe('');

    const login = await send(port, ADMIN_PATHS.login);
    const state = new URL(login.headers.location ?? '').searchParams.get('state') ?? '';
    const stateCookie = cookieValue(login.headers, '__Host-flagcount_admin_login') ?? '';
    const callback = (cookie: string) => send(port, `${ADMIN_PATHS.callback}?code=allowed&state=${state}`, { headers: { cookie } });
    // Another browser cannot use the state, and cannot spoil the login of the browser that started it either.
    expect((await callback('__Host-flagcount_admin_login=other')).status).toBe(400);
    expect((await callback(stateCookie)).status).toBe(200);
    expect((await callback(stateCookie)).status).toBe(400);

    const failing = await signIn(port, 'github-down');
    expect(failing.callback.status).toBe(502);
  });

  it('requires a session for the API and the CSRF token for changes', async () => {
    const { port } = await start();
    const { cookie, csrfToken } = await signIn(port);
    const manual = { reason: 'support', validUntil: null, note: null };

    expect(JSON.parse((await send(port, ADMIN_PATHS.session)).body)).toEqual({ authenticated: false });
    expect((await send(port, ADMIN_PATHS.licenses)).status).toBe(401);
    expect((await send(port, ADMIN_PATHS.licenses, change(cookie, 'wrong', manual))).status).toBe(403);
    expect((await send(port, ADMIN_PATHS.licenses, { ...change(cookie, csrfToken, manual), headers: { ...change(cookie, csrfToken, manual).headers, origin: 'https://evil.example' } })).status).toBe(403);
    expect((await send(port, ADMIN_PATHS.licenses, { ...change(cookie, csrfToken, manual), headers: { cookie, [CSRF_HEADER]: csrfToken, 'content-type': 'text/plain' } })).status).toBe(415);
  });

  it('manages licenses through the API', async () => {
    const { port } = await start();
    const { cookie, csrfToken } = await signIn(port);

    const created = await send(port, ADMIN_PATHS.licenses, change(cookie, csrfToken, { reason: 'creator', validUntil: '2026-12-31T00:00:00.000Z', note: 'Kooperation' }));
    expect(created.status).toBe(201);
    const { license, code } = JSON.parse(created.body) as { license: { id: string; reference: string }; code: string };
    expect(code).toMatch(/^FC(-[0-9A-Z]{5}){4}$/);

    const search = await send(port, `${ADMIN_PATHS.licenses}?q=${license.reference}`, { headers: { cookie } });
    expect(JSON.parse(search.body)).toMatchObject([{ id: license.id, source: 'manual' }]);

    const blocked = await send(port, `${ADMIN_PATHS.licenses}/${license.id}/block`, change(cookie, csrfToken, { blocked: true }));
    expect(JSON.parse(blocked.body)).toMatchObject({ supportStatus: 'blocked', access: null });

    const renewed = await send(port, `${ADMIN_PATHS.licenses}/${license.id}/code`, change(cookie, csrfToken, { delivery: 'email' }));
    expect(renewed.status).toBe(409);
    expect(JSON.parse(renewed.body)).toEqual({ error: 'no-email' });

    const deactivated = await send(port, `${ADMIN_PATHS.licenses}/${license.id}/installations/installation-aaaaaaaaaaaa/deactivate`, change(cookie, csrfToken, {}));
    expect(deactivated.status).toBe(404);

    const details = await send(port, `${ADMIN_PATHS.licenses}/${license.id}`, { headers: { cookie } });
    // The refused email renewal changed nothing and is therefore not audited.
    expect((JSON.parse(details.body) as { audit: { action: string }[] }).audit.map((entry) => entry.action)).toEqual([
      'license-blocked',
      'manual-license-created'
    ]);
    expect((await send(port, `${ADMIN_PATHS.licenses}/not-a-license`, { headers: { cookie } })).status).toBe(404);
    expect((await send(port, `${ADMIN_PATHS.licenses}?q=kunde@example.com`, { headers: { cookie } })).status).toBe(400);
  });

  it('signs out and expires idle sessions', async () => {
    const { port, advance } = await start();
    const first = await signIn(port);

    const logout = await send(port, ADMIN_PATHS.logout, change(first.cookie, first.csrfToken, {}));
    expect(logout.status).toBe(204);
    expect(logout.headers['set-cookie']?.[0]).toContain('Max-Age=0');
    expect((await send(port, ADMIN_PATHS.licenses, { headers: { cookie: first.cookie } })).status).toBe(401);

    const second = await signIn(port);
    advance(ADMIN_IDLE_TIMEOUT_MS + 1);
    expect((await send(port, ADMIN_PATHS.licenses, { headers: { cookie: second.cookie } })).status).toBe(401);
  });

  it('answers 503 while the license service is not connected', async () => {
    const { port } = await start({ admin: () => null });
    const { cookie } = await signIn(port);

    expect((await send(port, ADMIN_PATHS.licenses, { headers: { cookie } })).status).toBe(503);
  });

  it('rate-limits the login', async () => {
    const { port } = await start();

    for (let attempt = 0; attempt < 20; attempt++) await send(port, ADMIN_PATHS.login);
    const limited = await send(port, ADMIN_PATHS.login);

    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });
});
