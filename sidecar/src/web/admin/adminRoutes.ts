import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from '../../server/http';
import type { StructuredLogger } from '../structuredLog';
import type { AdminError, AdminResult, AdminService } from '../licensing/adminService';
import { RateLimiter } from '../licensing/rateLimiter';
import { ADMIN_ASSERTION_HEADER, type AdminAssertionVerifier } from './adminAssertion';

export const ADMIN_PATHS = {
  whoami: '/api/admin/whoami',
  licenses: '/api/admin/licenses'
} as const;

const LICENSE_PATH = /^\/api\/admin\/licenses\/([^/]+)(?:\/(validity|block|note|code)|\/installations\/([^/]+)\/deactivate)?$/;
const BODY_LIMIT = 4096;
const MINUTE = 60_000;
export const DEFAULT_API_LIMIT = 300;

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer'
};

const ERROR_STATUS: Record<AdminError, number> = {
  'invalid-input': 400,
  'not-found': 404,
  'provider-managed': 409,
  'no-email': 409,
  'installation-not-found': 404
};

export type AdminHandler = {
  /** Handles `/api/admin/…`; `false` for other paths. */
  handle(pathname: string, request: IncomingMessage, response: ServerResponse): Promise<boolean>;
};

export type AdminHandlerOptions = {
  /** Verifies the signed proof the Next.js web container sends for its authenticated administrators. */
  assertions: AdminAssertionVerifier;
  /** `null` while the license service is not connected: the API answers 503. */
  admin: () => AdminService | null;
  logger: StructuredLogger;
  clientAddress: (request: IncomingMessage) => string;
  /** Requests per client in five minutes. */
  apiLimit?: number;
  now?: () => number;
};

class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}

function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= BODY_LIMIT) chunks.push(chunk);
    });
    request.on('end', () => {
      if (size > BODY_LIMIT) {
        reject(new RequestError(413, 'request-too-large'));
        return;
      }
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        const value: unknown = text ? JSON.parse(text) : {};
        if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not an object');
        resolve(value as Record<string, unknown>);
      } catch {
        reject(new RequestError(400, 'invalid-request'));
      }
    });
    request.on('error', reject);
  });
}

/**
 * The admin API behind the Next.js admin dashboard. Administrators sign in at the web container; every request
 * here needs its signed, short-lived proof for exactly this method and path, so reaching the backend alone never
 * grants admin rights. The API also enforces rate limits and body limits; the admin service writes the audit log.
 */
export function createAdminHandler(options: AdminHandlerOptions): AdminHandler {
  const { logger } = options;
  const now = options.now ?? Date.now;
  const limiter = new RateLimiter({ limit: options.apiLimit ?? DEFAULT_API_LIMIT, windowMs: 5 * MINUTE, now });

  const json = (response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) =>
    sendJson(response, status, body, { ...SECURITY_HEADERS, ...headers });

  const result = <T>(response: ServerResponse, outcome: AdminResult<T>, status = 200) => {
    if (outcome.ok) json(response, status, outcome.value);
    else json(response, ERROR_STATUS[outcome.error], { error: outcome.error });
  };

  const authenticate = (pathname: string, request: IncomingMessage): { subject: string } | null => {
    const verification = options.assertions.verify(request.headers[ADMIN_ASSERTION_HEADER], { method: request.method ?? 'GET', path: pathname });
    if (verification.ok) return { subject: verification.claims.sub };
    logger('warn', 'admin-assertion-rejected', { reason: verification.reason });
    return null;
  };

  const acceptChange = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
    if (request.method !== 'POST') throw new RequestError(405, 'method-not-allowed');
    if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw new RequestError(415, 'unsupported-media-type');
    return readBody(request);
  };

  const api = async (pathname: string, request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const actor = authenticate(pathname, request);
    if (!actor) {
      json(response, 401, { error: 'unauthorized' });
      return;
    }

    if (pathname === ADMIN_PATHS.whoami) {
      if (request.method !== 'GET') throw new RequestError(405, 'method-not-allowed');
      json(response, 200, { subject: actor.subject });
      return;
    }

    const admin = options.admin();
    if (!admin) {
      json(response, 503, { error: 'licensing-unavailable' });
      return;
    }

    if (pathname === ADMIN_PATHS.licenses) {
      if (request.method === 'GET') {
        const query = new URL(request.url ?? '/', 'http://localhost').searchParams;
        const value = (name: string) => query.get(name) ?? undefined;
        result(response, await admin.list({ q: value('q'), source: value('source'), status: value('status'), support: value('support'), page: value('page') }));
        return;
      }
      const body = await acceptChange(request);
      result(response, await admin.createManualLicense(actor, { reason: body['reason'], validUntil: body['validUntil'], note: body['note'] }), 201);
      return;
    }

    const match = LICENSE_PATH.exec(pathname);
    if (!match) {
      json(response, 404, { error: 'not-found' });
      return;
    }
    const licenseId = decodeURIComponent(match[1] ?? '');
    const [, , action, installationId] = match;

    if (!action && !installationId) {
      if (request.method !== 'GET') throw new RequestError(405, 'method-not-allowed');
      result(response, await admin.details(licenseId));
      return;
    }

    const body = await acceptChange(request);
    if (installationId) {
      result(response, await admin.deactivateInstallation(actor, licenseId, decodeURIComponent(installationId)));
      return;
    }
    switch (action) {
      case 'validity':
        result(response, await admin.updateManualValidity(actor, licenseId, body['validUntil']));
        return;
      case 'block':
        result(response, await admin.setBlocked(actor, licenseId, body['blocked']));
        return;
      case 'note':
        result(response, await admin.setNote(actor, licenseId, body['note']));
        return;
      case 'code':
        result(response, await admin.renewActivationCode(actor, licenseId, body['delivery']));
        return;
    }
  };

  return {
    async handle(pathname, request, response) {
      if (pathname !== '/api/admin' && !pathname.startsWith('/api/admin/')) return false;

      try {
        const decision = limiter.consume(options.clientAddress(request));
        if (!decision.allowed) {
          json(response, 429, { error: 'rate-limited' }, { 'Retry-After': String(decision.retryAfterSeconds) });
          return true;
        }
        await api(pathname, request, response);
      } catch (error) {
        if (error instanceof RequestError) {
          if (error.status === 405) response.setHeader('Allow', 'GET, POST');
          json(response, error.status, { error: error.code });
        } else {
          logger('error', 'admin-request-failed', { error: error instanceof Error ? error.name : typeof error });
          if (response.headersSent) response.end();
          else json(response, 500, { error: 'internal' });
        }
      }
      return true;
    }
  };
}
