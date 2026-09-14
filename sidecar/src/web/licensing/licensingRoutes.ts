import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { BASE_HEADERS, sendJson } from '../../server/http';
import type { StructuredLogger } from '../structuredLog';
import { BILLING_PLANS, type BillingPlanId } from './billing';
import type { LicenseService } from './licenseService';
import { RateLimiter, type RateLimiterOptions } from './rateLimiter';

export const LICENSING_PATHS = {
  activate: '/api/v1/licenses/activate',
  refresh: '/api/v1/licenses/refresh',
  deactivate: '/api/v1/licenses/deactivate',
  recover: '/api/v1/licenses/recover',
  portal: '/api/v1/billing/portal',
  checkout: '/api/v1/billing/checkout',
  prices: '/api/v1/billing/prices',
  webhook: '/api/v1/billing/webhooks/paddle'
} as const;

export type LicensingRoute = keyof typeof LICENSING_PATHS;

type Limit = Pick<RateLimiterOptions, 'limit' | 'windowMs'>;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Activation and recovery are guessable-secret endpoints and get the strictest limits. */
export const DEFAULT_LIMITS: Record<LicensingRoute, Limit> = {
  activate: { limit: 10, windowMs: 15 * MINUTE },
  refresh: { limit: 60, windowMs: HOUR },
  deactivate: { limit: 20, windowMs: HOUR },
  recover: { limit: 5, windowMs: HOUR },
  portal: { limit: 20, windowMs: HOUR },
  checkout: { limit: 30, windowMs: HOUR },
  prices: { limit: 120, windowMs: HOUR },
  webhook: { limit: 600, windowMs: MINUTE }
};

const JSON_BODY_LIMIT = 4096;
const WEBHOOK_BODY_LIMIT = 1_000_000;

export type LicensingHandler = {
  /** Handles `/api/v1/` requests; `false` for paths that belong to someone else. */
  handle(pathname: string, request: IncomingMessage, response: ServerResponse): Promise<boolean>;
  /** Readiness of the dependencies: the database, if licensing is enabled. */
  ready(): Promise<boolean>;
};

export type LicensingHandlerOptions = {
  /** `null` while billing is not configured or not connected yet: every route answers 503. */
  service: LicenseService | null | (() => LicenseService | null);
  /** Billing is configured, so a missing service means its database is unavailable. */
  required?: boolean;
  logger: StructuredLogger;
  clientAddress: (request: IncomingMessage) => string;
  limits?: Partial<Record<LicensingRoute, Limit>>;
  now?: () => number;
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}

function readBody(request: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    request.on('end', () => {
      if (size > limit) reject(new HttpError(413, 'request-too-large'));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', reject);
  });
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'unsupported-media-type');
  }
  const text = await readBody(request, JSON_BODY_LIMIT);
  try {
    const value: unknown = text ? JSON.parse(text) : {};
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not an object');
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'invalid-request');
  }
}

function noContent(response: ServerResponse, status = 204): void {
  response.writeHead(status, BASE_HEADERS);
  response.end();
}

/**
 * Public license and billing endpoints. Separate from the password-protected dashboard API: no
 * cookies, strict rate limits, and logs that contain neither codes, secrets, addresses nor IPs.
 */
export function createLicensingHandler(options: LicensingHandlerOptions): LicensingHandler {
  const { logger } = options;
  const currentService = (): LicenseService | null =>
    typeof options.service === 'function' ? options.service() : options.service;
  const now = options.now ?? Date.now;
  const limiters = new Map(
    (Object.keys(LICENSING_PATHS) as LicensingRoute[]).map((route) => [
      route,
      new RateLimiter({ ...DEFAULT_LIMITS[route], ...options.limits?.[route], now })
    ])
  );
  const routeByPath = new Map(
    (Object.entries(LICENSING_PATHS) as [LicensingRoute, string][]).map(([route, path]) => [path, route])
  );

  const run = async (
    route: LicensingRoute,
    licenses: LicenseService,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> => {
    switch (route) {
      case 'activate': {
        const body = await readJson(request);
        const result = await licenses.activate({
          code: body['code'],
          installationId: body['installationId'],
          replaceInstallationId: body['replaceInstallationId']
        });
        if (result.ok) {
          sendJson(response, 200, { licenseId: result.licenseId, activationSecret: result.activationSecret, entitlement: result.entitlement });
        } else if (result.error === 'installation-limit') {
          sendJson(response, 409, { error: result.error, installations: result.installations });
        } else {
          sendJson(response, result.error === 'license-inactive' ? 403 : 400, { error: result.error });
        }
        return;
      }
      case 'refresh': {
        const body = await readJson(request);
        const result = await licenses.refresh({ licenseId: body['licenseId'], installationId: body['installationId'], secret: body['secret'] });
        if (result.ok) sendJson(response, 200, { entitlement: result.entitlement });
        else sendJson(response, result.error === 'license-inactive' ? 403 : 401, { error: result.error });
        return;
      }
      case 'deactivate': {
        const body = await readJson(request);
        const deactivated = await licenses.deactivate({
          licenseId: body['licenseId'],
          installationId: body['installationId'],
          secret: body['secret']
        });
        if (deactivated) noContent(response);
        else sendJson(response, 401, { error: 'invalid-installation' });
        return;
      }
      case 'recover': {
        const body = await readJson(request);
        await licenses.recover(body['email']);
        noContent(response, 202);
        return;
      }
      case 'portal': {
        const body = await readJson(request);
        const portal = await licenses.portal({ licenseId: body['licenseId'], installationId: body['installationId'], secret: body['secret'] });
        if (portal.ok) sendJson(response, 200, { url: portal.url });
        else sendJson(response, portal.error === 'invalid-installation' ? 401 : 409, { error: portal.error });
        return;
      }
      case 'checkout': {
        const body = await readJson(request);
        const plan = body['plan'];
        if (typeof plan !== 'string' || !BILLING_PLANS.includes(plan as BillingPlanId)) {
          throw new HttpError(400, 'invalid-plan');
        }
        sendJson(response, 200, await licenses.checkout(plan as BillingPlanId));
        return;
      }
      case 'prices': {
        const prices = await licenses.prices({ ip: options.clientAddress(request) });
        sendJson(response, 200, { prices }, { 'Cache-Control': 'private, max-age=300' });
        return;
      }
      case 'webhook': {
        const rawBody = await readBody(request, WEBHOOK_BODY_LIMIT);
        const signature = request.headers['paddle-signature'];
        const result = await licenses.handleWebhook(rawBody, typeof signature === 'string' ? signature : undefined);
        if (result.status === 200) sendJson(response, 200, { ok: true });
        else sendJson(response, result.status, { error: result.status === 500 ? 'processing-failed' : 'rejected' });
        return;
      }
    }
  };

  return {
    async handle(pathname, request, response) {
      if (!pathname.startsWith('/api/v1/')) return false;
      const requestId = randomBytes(8).toString('hex');
      response.setHeader('X-Request-Id', requestId);
      const started = now();
      const route = routeByPath.get(pathname);

      try {
        if (!route) {
          sendJson(response, 404, { error: 'not-found' });
          return true;
        }
        const method = route === 'prices' ? 'GET' : 'POST';
        if (request.method !== method) {
          response.setHeader('Allow', method);
          sendJson(response, 405, { error: 'method-not-allowed' });
          return true;
        }
        const service = currentService();
        if (!service) {
          sendJson(response, 503, { error: 'billing-unavailable' });
          return true;
        }
        const decision = limiters.get(route)?.consume(options.clientAddress(request));
        if (decision && !decision.allowed) {
          sendJson(response, 429, { error: 'rate-limited' }, { 'Retry-After': String(decision.retryAfterSeconds) });
          return true;
        }
        await run(route, service, request, response);
      } catch (error) {
        if (error instanceof HttpError) {
          sendJson(response, error.status, { error: error.code });
        } else {
          logger('error', 'licensing-request-failed', { requestId, route: route ?? 'unknown', error: error instanceof Error ? error.name : typeof error });
          if (!response.headersSent) sendJson(response, 502, { error: 'provider-unavailable' });
          else response.end();
        }
      } finally {
        logger('info', 'licensing-request', { requestId, route: route ?? 'unknown', status: response.statusCode, durationMs: now() - started });
      }
      return true;
    },

    async ready() {
      const service = currentService();
      if (!service) return !options.required;
      try {
        await service.ping();
        return true;
      } catch {
        return false;
      }
    }
  };
}
