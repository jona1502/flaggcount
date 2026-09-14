import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultSettings } from '../../../../shared/profiles';
import { createEntitlementSigner, generateSigningKeyPair } from '../../license/signature';
import type { LogFields } from '../structuredLog';
import { WebController } from '../webController';
import { clientAddress, startWebServer } from '../webServer';
import type { BillingEvent, BillingProvider, MailMessage } from './billing';
import { LicenseService } from './licenseService';
import { LICENSING_PATHS, createLicensingHandler, type LicensingHandlerOptions } from './licensingRoutes';
import { MemoryLicenseStore } from './store';

const KEYS = generateSigningKeyPair();
const cleanups: (() => Promise<unknown>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const provider: BillingProvider = {
  name: 'paddle',
  verifyWebhook: (rawBody, signature) =>
    signature === 'valid' ? { ok: true, event: JSON.parse(rawBody) as BillingEvent } : { ok: false, reason: 'invalid-signature' },
  createCheckout: async (plan) => ({ url: `https://pay.example/${plan}` }),
  createPortalSession: async () => ({ url: 'https://portal.example' }),
  customerEmail: async () => 'kunde@example.com',
  customerIdsByEmail: async () => [],
  previewPrices: async () => [
    { plan: 'yearly', currencyCode: 'EUR', subtotal: '49,58 €', tax: '9,42 €', total: '59,00 €', interval: 'year', frequency: 1 }
  ]
};

async function start(overrides: Partial<LicensingHandlerOptions> = {}, withService = true) {
  const store = new MemoryLicenseStore();
  const mails: MailMessage[] = [];
  const logs: LogFields[] = [];
  const service = new LicenseService({
    store,
    provider,
    signer: createEntitlementSigner(KEYS.privateKeyPem, 'k1'),
    mailer: { send: async (message) => void mails.push(message) },
    codePepper: 'pepper',
    supportEmail: 'support@example.com',
    logger: () => undefined
  });
  const controller = new WebController(
    () => ({ connect: async () => undefined, disconnect: async () => undefined }),
    createDefaultSettings('2026-01-01T00:00:00.000Z'),
    { save: async () => undefined },
    () => undefined
  );
  const server = await startWebServer({
    backend: controller,
    password: 'correct-horse-battery',
    licensing: createLicensingHandler({
      service: withService ? service : null,
      logger: (_level, _event, fields) => void logs.push(fields ?? {}),
      clientAddress,
      ...overrides
    })
  });
  cleanups.push(() => controller.shutdown(), () => server.close());
  return { port: server.port, store, mails, logs };
}

type Response = { status: number; body: string; headers: IncomingHttpHeaders };

function send(
  port: number,
  path: string,
  { method = 'POST', body, headers = { 'content-type': 'application/json' } }: { method?: string; body?: string; headers?: Record<string, string> } = {}
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, path, method, headers, agent: false }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (text += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text, headers: response.headers }));
    });
    request.on('error', reject);
    request.end(body);
  });
}

const json = (value: unknown) => ({ body: JSON.stringify(value) });

describe('licensing routes', () => {
  it('runs the purchase, activation and refresh flow over HTTP', async () => {
    const { port, mails, logs } = await start();
    const created = {
      kind: 'subscription',
      eventId: 'evt_1',
      eventType: 'subscription.created',
      occurredAt: new Date().toISOString(),
      subscription: { customerId: 'ctm_1', subscriptionId: 'sub_1', status: 'active', currentPeriodEndsAt: null, scheduledCancelAt: null, canceledAt: null }
    };

    const webhook = await send(port, LICENSING_PATHS.paddleWebhook, { body: JSON.stringify(created), headers: { 'paddle-signature': 'valid' } });
    expect(webhook.status).toBe(200);
    const code = /FC(-[0-9A-Z]{5}){4}/.exec(mails[0]?.text ?? '')?.[0];

    const activation = await send(port, LICENSING_PATHS.activate, json({ code, installationId: 'installation-0123456789' }));
    expect(activation.status).toBe(200);
    expect(activation.headers['x-request-id']).toMatch(/^[0-9a-f]{16}$/);
    const { licenseId, activationSecret } = JSON.parse(activation.body) as { licenseId: string; activationSecret: string };

    const refresh = await send(port, LICENSING_PATHS.refresh, json({ licenseId, installationId: 'installation-0123456789', secret: activationSecret }));
    expect(refresh.status).toBe(200);
    expect(JSON.parse(refresh.body).entitlement.plan).toBe('pro');

    const deactivate = await send(port, LICENSING_PATHS.deactivate, json({ licenseId, installationId: 'installation-0123456789', secret: activationSecret }));
    expect(deactivate.status).toBe(204);

    const logged = JSON.stringify(logs);
    expect(logged).not.toContain(activationSecret);
    expect(logged).not.toContain(code?.slice(3));
    expect(logged).not.toContain('127.0.0.1');
  });

  it('maps service errors to HTTP status codes', async () => {
    const { port } = await start();

    expect((await send(port, LICENSING_PATHS.activate, json({ code: 'FC-00000-00000-00000-00000', installationId: 'installation-0123456789' }))).status).toBe(400);
    expect((await send(port, LICENSING_PATHS.refresh, json({ licenseId: 'x', installationId: 'installation-0123456789', secret: 'y' }))).status).toBe(401);
    expect((await send(port, LICENSING_PATHS.paddleWebhook, { body: '{}', headers: { 'paddle-signature': 'forged' } })).status).toBe(401);
    expect((await send(port, LICENSING_PATHS.recover, json({ email: 'jemand@example.com' }))).status).toBe(202);
    expect((await send(port, LICENSING_PATHS.checkout, json({ plan: 'lifetime' }))).status).toBe(400);
    expect(JSON.parse((await send(port, LICENSING_PATHS.checkout, json({ plan: 'yearly' }))).body)).toEqual({ url: 'https://pay.example/yearly' });
  });

  it('accepts webhooks only at the endpoint of the configured provider', async () => {
    const { port } = await start();
    const event = JSON.stringify({ kind: 'other', eventId: 'evt_2', eventType: 'test', occurredAt: new Date().toISOString() });

    expect((await send(port, LICENSING_PATHS.stripeWebhook, { body: event, headers: { 'stripe-signature': 'valid' } })).status).toBe(404);
    expect((await send(port, LICENSING_PATHS.paddleWebhook, { body: event, headers: { 'stripe-signature': 'valid' } })).status).toBe(401);
    expect((await send(port, LICENSING_PATHS.paddleWebhook, { body: event, headers: { 'paddle-signature': 'valid' } })).status).toBe(200);
  });

  it('answers the checkout status without caching and never for other methods', async () => {
    const { port } = await start();

    const status = await send(port, `${LICENSING_PATHS.checkoutStatus}?session_id=cs_test_a1B2c3D4e5F6`, { method: 'GET', headers: {} });
    expect(status.status).toBe(200);
    expect(status.headers['cache-control']).toBe('no-store');
    // The test provider has no checkout lookup, so every session stays unknown.
    expect(JSON.parse(status.body)).toEqual({ status: 'unknown', paid: false });
    expect((await send(port, LICENSING_PATHS.checkoutStatus, json({ session_id: 'cs_test_a1B2c3D4e5F6' }))).status).toBe(405);
  });

  it('serves provider prices with a short private cache', async () => {
    const { port } = await start();

    const response = await send(port, LICENSING_PATHS.prices, { method: 'GET', headers: {} });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, max-age=300');
    expect(JSON.parse(response.body).prices[0]).toMatchObject({ plan: 'yearly', total: '59,00 €' });
  });

  it('rejects wrong methods, media types, oversized bodies and unknown paths', async () => {
    const { port } = await start();

    expect((await send(port, LICENSING_PATHS.activate, { method: 'GET', headers: {} })).status).toBe(405);
    expect((await send(port, LICENSING_PATHS.activate, { body: 'code=1', headers: { 'content-type': 'text/plain' } })).status).toBe(415);
    expect((await send(port, LICENSING_PATHS.activate, { body: '{' })).status).toBe(400);
    expect((await send(port, LICENSING_PATHS.activate, json({ code: 'x'.repeat(5000) }))).status).toBe(413);
    expect((await send(port, '/api/v1/unknown', json({}))).status).toBe(404);
  });

  it('rate-limits activation attempts per client', async () => {
    const { port } = await start({ limits: { activate: { limit: 2, windowMs: 60_000 } } });
    const attempt = () => send(port, LICENSING_PATHS.activate, json({ code: 'FC-00000-00000-00000-00000', installationId: 'installation-0123456789' }));

    expect((await attempt()).status).toBe(400);
    expect((await attempt()).status).toBe(400);
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('answers 503 while billing is not configured and stays ready', async () => {
    const { port } = await start({}, false);

    expect((await send(port, LICENSING_PATHS.activate, json({}))).status).toBe(503);
    expect((await send(port, '/readyz', { method: 'GET', headers: {} })).status).toBe(200);
  });

  it('is not ready while configured billing has no database connection', async () => {
    const { port } = await start({ service: () => null, required: true });

    expect((await send(port, '/readyz', { method: 'GET', headers: {} })).status).toBe(503);
    expect((await send(port, '/healthz', { method: 'GET', headers: {} })).status).toBe(200);
    expect((await send(port, LICENSING_PATHS.refresh, json({}))).status).toBe(503);
  });
});
