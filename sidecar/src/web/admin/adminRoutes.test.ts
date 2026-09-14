import { createServer, request as httpRequest, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createEntitlementSigner, generateSigningKeyPair } from '../../license/signature';
import { AdminService } from '../licensing/adminService';
import type { BillingProvider } from '../licensing/billing';
import { LicenseService } from '../licensing/licenseService';
import { MemoryLicenseStore } from '../licensing/store';
import type { LogFields } from '../structuredLog';
import { ADMIN_ASSERTION_HEADER, AdminAssertionVerifier, signAdminAssertion } from './adminAssertion';
import { ADMIN_PATHS, createAdminHandler, type AdminHandlerOptions } from './adminRoutes';

const KEYS = generateSigningKeyPair();
const SECRET = 'a'.repeat(40);
const NOW = Date.parse('2026-09-14T10:00:00.000Z');
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

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
  const clock = () => NOW;
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
  const handler = createAdminHandler({
    assertions: new AdminAssertionVerifier({ secret: SECRET, allowedSubjects: () => new Set(['github:4242']), now: clock }),
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
  return { port: (server.address() as AddressInfo).port, logs };
}

type Response = { status: number; body: string; headers: IncomingHttpHeaders };

function send(port: number, path: string, options: { method?: string; headers?: Record<string, string>; body?: unknown; raw?: string } = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, path, method: options.method ?? 'GET', headers: options.headers, agent: false }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (text += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text, headers: response.headers }));
    });
    request.on('error', reject);
    request.end(options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body)));
  });
}

const signed = (method: string, path: string, overrides: Partial<Parameters<typeof signAdminAssertion>[0]> = {}) => ({
  [ADMIN_ASSERTION_HEADER]: signAdminAssertion({ subject: 'github:4242', login: 'jona', method, path, secret: SECRET, now: NOW, ...overrides })
});

/** A signed request; the signature covers the path without the query string. */
function call(port: number, method: 'GET' | 'POST', pathWithQuery: string, body?: unknown) {
  const path = pathWithQuery.split('?')[0] ?? pathWithQuery;
  return send(port, pathWithQuery, {
    method,
    headers: { ...signed(method, path), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body
  });
}

describe('admin API', () => {
  it('handles only admin API paths', async () => {
    const { port } = await start();

    for (const path of ['/api/state', '/admin', '/admin/auth/login', '/admin.html']) {
      expect((await send(port, path)).body, path).toBe('not admin');
    }
  });

  it('requires a valid assertion for every request', async () => {
    const { port, logs } = await start();
    const once = signed('GET', ADMIN_PATHS.whoami, { nonce: 'once' });

    expect((await send(port, ADMIN_PATHS.whoami)).status).toBe(401);
    expect((await send(port, ADMIN_PATHS.whoami, { headers: signed('GET', ADMIN_PATHS.whoami, { secret: 'b'.repeat(40) }) })).status).toBe(401);
    expect((await send(port, ADMIN_PATHS.whoami, { headers: once })).status).toBe(200);
    expect((await send(port, ADMIN_PATHS.whoami, { headers: once })).status).toBe(401);
    expect((await send(port, ADMIN_PATHS.whoami, { headers: signed('GET', ADMIN_PATHS.licenses) })).status).toBe(401);
    expect((await send(port, ADMIN_PATHS.whoami, { headers: signed('POST', ADMIN_PATHS.whoami) })).status).toBe(401);
    expect((await send(port, ADMIN_PATHS.whoami, { headers: signed('GET', ADMIN_PATHS.whoami, { subject: 'github:7' }) })).status).toBe(401);
    // A dashboard session cookie grants nothing here.
    expect((await send(port, ADMIN_PATHS.whoami, { headers: { cookie: 'flagcount_session=anything; __Host-flagcount_admin=anything' } })).status).toBe(401);

    expect(logs.filter((entry) => entry.event === 'admin-assertion-rejected').map((entry) => entry.fields?.['reason'])).toEqual([
      'malformed',
      'bad-signature',
      'replayed',
      'wrong-request',
      'wrong-request',
      'not-allowed',
      'malformed'
    ]);
  });

  it('manages licenses and records every change', async () => {
    const { port } = await start();

    const created = await call(port, 'POST', ADMIN_PATHS.licenses, { reason: 'creator', validUntil: '2026-12-31T00:00:00.000Z', note: 'Kooperation' });
    expect(created.status).toBe(201);
    const { license, code } = JSON.parse(created.body) as { license: { id: string; reference: string }; code: string };
    expect(code).toMatch(/^FC(-[0-9A-Z]{5}){4}$/);

    const list = await call(port, 'GET', `${ADMIN_PATHS.licenses}?q=${license.reference}&source=manual&page=1`);
    expect(JSON.parse(list.body)).toMatchObject({ items: [{ id: license.id, source: 'manual' }], total: 1, page: 1, pageSize: 25 });
    expect((await call(port, 'GET', `${ADMIN_PATHS.licenses}?status=refunded`)).status).toBe(400);

    const blocked = await call(port, 'POST', `${ADMIN_PATHS.licenses}/${license.id}/block`, { blocked: true });
    expect(JSON.parse(blocked.body)).toMatchObject({ supportStatus: 'blocked', access: null });

    const renewed = await call(port, 'POST', `${ADMIN_PATHS.licenses}/${license.id}/code`, { delivery: 'email' });
    expect(renewed.status).toBe(409);
    expect(JSON.parse(renewed.body)).toEqual({ error: 'no-email' });

    expect((await call(port, 'POST', `${ADMIN_PATHS.licenses}/${license.id}/installations/installation-aaaaaaaaaaaa/deactivate`, {})).status).toBe(404);

    const details = await call(port, 'GET', `${ADMIN_PATHS.licenses}/${license.id}`);
    expect(JSON.parse(details.body)).toMatchObject({ deactivatedInstallations: [] });
    expect((JSON.parse(details.body) as { audit: { action: string; adminSubject: string }[] }).audit).toMatchObject([
      { action: 'license-blocked', adminSubject: 'github:4242' },
      { action: 'manual-license-created', adminSubject: 'github:4242' }
    ]);
    expect((await call(port, 'GET', `${ADMIN_PATHS.licenses}/not-a-license`)).status).toBe(404);
  });

  it('rejects wrong methods, media types and oversized bodies', async () => {
    const { port } = await start();
    const path = ADMIN_PATHS.licenses;

    expect((await send(port, path, { method: 'POST', headers: { ...signed('POST', path), 'content-type': 'text/plain' }, raw: 'reason=support' })).status).toBe(415);
    expect((await send(port, path, { method: 'POST', headers: { ...signed('POST', path), 'content-type': 'application/json' }, raw: 'x'.repeat(5000) })).status).toBe(413);
    // Correctly signed for POST, but the endpoint only answers GET.
    expect((await send(port, ADMIN_PATHS.whoami, { method: 'POST', headers: signed('POST', ADMIN_PATHS.whoami) })).status).toBe(405);
    expect((await call(port, 'POST', `${path}/11111111-2222-4333-8444-555555555555`, {})).status).toBe(405);
  });

  it('answers 503 while the license service is not connected', async () => {
    const { port } = await start({ admin: () => null });

    expect((await call(port, 'GET', ADMIN_PATHS.licenses)).status).toBe(503);
    expect((await call(port, 'GET', ADMIN_PATHS.whoami)).status).toBe(200);
  });

  it('rate-limits requests per client', async () => {
    const { port } = await start({ apiLimit: 2 });

    expect((await call(port, 'GET', ADMIN_PATHS.whoami)).status).toBe(200);
    expect((await call(port, 'GET', ADMIN_PATHS.whoami)).status).toBe(200);
    const limited = await call(port, 'GET', ADMIN_PATHS.whoami);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });
});
