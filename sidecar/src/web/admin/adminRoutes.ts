import type { IncomingMessage, ServerResponse } from 'node:http';
import { BASE_HEADERS, sendJson } from '../../server/http';
import { readCookie } from '../session';
import type { StructuredLogger } from '../structuredLog';
import type { AdminError, AdminResult, AdminService } from '../licensing/adminService';
import { RateLimiter } from '../licensing/rateLimiter';
import {
  ADMIN_LOGIN_COOKIE,
  ADMIN_SESSION_COOKIE,
  adminLoginCookie,
  adminSessionCookie,
  clearedAdminLoginCookie,
  clearedAdminSessionCookie,
  safeEqual,
  type AdminConfig,
  type AdminSession,
  type AdminSessions,
  type GitHubOAuth
} from './adminAuth';

export const ADMIN_PATHS = {
  page: '/admin',
  login: '/admin/auth/login',
  callback: '/admin/auth/callback',
  session: '/api/admin/session',
  logout: '/api/admin/logout',
  licenses: '/api/admin/licenses'
} as const;

export const CSRF_HEADER = 'x-csrf-token';

const LICENSE_PATH = /^\/api\/admin\/licenses\/([^/]+)(?:\/(validity|block|note|code)|\/installations\/([^/]+)\/deactivate)?$/;
const BODY_LIMIT = 4096;
const MINUTE = 60_000;

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer'
};

/** Pages rendered by the login flow contain no script and load nothing. */
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const ERROR_STATUS: Record<AdminError, number> = {
  'invalid-input': 400,
  'not-found': 404,
  'provider-managed': 409,
  'no-email': 409,
  'installation-not-found': 404
};

export type AdminHandler = {
  /** Handles `/admin/auth/…` and `/api/admin/…`; `false` for other paths. */
  handle(pathname: string, request: IncomingMessage, response: ServerResponse): Promise<boolean>;
};

export type AdminHandlerOptions = {
  config: AdminConfig;
  sessions: AdminSessions;
  oauth: Pick<GitHubOAuth, 'authorizeUrl' | 'identify'>;
  /** `null` while the license service is not connected: the API answers 503. */
  admin: () => AdminService | null;
  logger: StructuredLogger;
  clientAddress: (request: IncomingMessage) => string;
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

function page(response: ServerResponse, status: number, title: string, text: string, headers: Record<string, string | string[]> = {}, refresh = false): void {
  const escape = (value: string) => value.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);
  const body = [
    '<!doctype html><html lang="de"><head><meta charset="utf-8">',
    refresh ? '<meta http-equiv="refresh" content="0;url=/admin">' : '',
    `<title>${escape(title)}</title>`,
    '<style>body{font-family:system-ui,sans-serif;background:#111115;color:#f4f4f6;display:grid;place-items:center;min-height:100vh;margin:0}a{color:#f43b49}</style>',
    `</head><body><main><h1>${escape(title)}</h1><p>${escape(text)}</p><p><a href="/admin">Zum Admin-Bereich</a></p></main></body></html>`
  ].join('');
  response.writeHead(status, {
    ...BASE_HEADERS,
    ...SECURITY_HEADERS,
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': PAGE_CSP,
    ...headers
  });
  response.end(body);
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
 * The admin area: GitHub login restricted to configured account ids, short server-side sessions in
 * `__Host-` cookies (HttpOnly, Secure, SameSite=Strict), a CSRF token for every change, an Origin check
 * and rate limits. Completely separate from the dashboard login and its password.
 */
export function createAdminHandler(options: AdminHandlerOptions): AdminHandler {
  const { config, sessions, oauth, logger } = options;
  const now = options.now ?? Date.now;
  const loginLimiter = new RateLimiter({ limit: 20, windowMs: 15 * MINUTE, now });
  const apiLimiter = new RateLimiter({ limit: 300, windowMs: 5 * MINUTE, now });

  const sessionOf = (request: IncomingMessage): { token: string | undefined; session: AdminSession | null } => {
    const token = readCookie(request.headers.cookie, ADMIN_SESSION_COOKIE);
    return { token, session: sessions.verify(token) };
  };

  const json = (response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) =>
    sendJson(response, status, body, { ...SECURITY_HEADERS, ...headers });

  const result = <T>(response: ServerResponse, outcome: AdminResult<T>, status = 200) => {
    if (outcome.ok) json(response, status, outcome.value);
    else json(response, ERROR_STATUS[outcome.error], { error: outcome.error });
  };

  /** Changes need the session's CSRF token and a same-origin JSON request. */
  const acceptChange = async (request: IncomingMessage, session: AdminSession): Promise<Record<string, unknown>> => {
    if (request.method !== 'POST') throw new RequestError(405, 'method-not-allowed');
    if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw new RequestError(415, 'unsupported-media-type');
    const origin = request.headers.origin;
    if (origin !== undefined) {
      let sameOrigin = false;
      try {
        sameOrigin = new URL(origin).host === request.headers.host;
      } catch {
        sameOrigin = false;
      }
      if (!sameOrigin) throw new RequestError(403, 'forbidden');
    }
    if (!safeEqual(request.headers[CSRF_HEADER], session.csrfToken)) throw new RequestError(403, 'invalid-csrf-token');
    return readBody(request);
  };

  const login = (request: IncomingMessage, response: ServerResponse): void => {
    if (request.method !== 'GET') throw new RequestError(405, 'method-not-allowed');
    const { state, challenge } = sessions.beginLogin();
    response.writeHead(302, { ...BASE_HEADERS, ...SECURITY_HEADERS, Location: oauth.authorizeUrl(state, challenge), 'Set-Cookie': adminLoginCookie(state) });
    response.end();
  };

  const callback = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== 'GET') throw new RequestError(405, 'method-not-allowed');
    const query = new URL(request.url ?? '/', 'http://localhost').searchParams;
    const state = query.get('state') ?? '';
    const code = query.get('code') ?? '';
    const cookieState = readCookie(request.headers.cookie, ADMIN_LOGIN_COOKIE);
    const clearLogin = { 'Set-Cookie': clearedAdminLoginCookie() };

    // The state must come back to the browser that started the login, and only once.
    const verifier = cookieState && safeEqual(state, cookieState) ? sessions.finishLogin(state) : null;
    if (!verifier || !code || code.length > 256) {
      logger('warn', 'admin-login-rejected', { reason: 'invalid-state' });
      page(response, 400, 'Anmeldung abgelaufen', 'Bitte starte die Anmeldung erneut.', clearLogin);
      return;
    }

    let account: { id: string; login: string };
    try {
      account = await oauth.identify(code, verifier);
    } catch (error) {
      logger('error', 'admin-login-failed', { error: error instanceof Error ? error.name : typeof error });
      page(response, 502, 'Anmeldung fehlgeschlagen', 'GitHub ist gerade nicht erreichbar. Bitte versuche es später erneut.', clearLogin);
      return;
    }
    if (!config.allowedUserIds.has(account.id)) {
      logger('warn', 'admin-login-rejected', { reason: 'not-allowed' });
      page(response, 403, 'Kein Zugriff', 'Dieses GitHub-Konto ist nicht für den Admin-Bereich freigegeben.', clearLogin);
      return;
    }

    const { token } = sessions.create(`github:${account.id}`, account.login);
    logger('info', 'admin-signed-in', { admin: `github:${account.id}` });
    // A page on this origin navigates on, so the SameSite=Strict cookie is sent with the next request.
    page(response, 200, 'Angemeldet', 'Du wirst zum Admin-Bereich weitergeleitet.', {
      'Set-Cookie': [adminSessionCookie(token), clearedAdminLoginCookie()]
    }, true);
  };

  const api = async (pathname: string, request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const { token, session } = sessionOf(request);

    if (pathname === ADMIN_PATHS.session) {
      if (request.method !== 'GET') throw new RequestError(405, 'method-not-allowed');
      json(
        response,
        200,
        session
          ? { authenticated: true, login: session.login, subject: session.subject, csrfToken: session.csrfToken, expiresAt: new Date(sessions.expiresAt(session)).toISOString() }
          : { authenticated: false }
      );
      return;
    }
    if (!session) {
      json(response, 401, { error: 'unauthorized' });
      return;
    }
    const actor = { subject: session.subject };

    if (pathname === ADMIN_PATHS.logout) {
      await acceptChange(request, session);
      sessions.destroy(token);
      logger('info', 'admin-signed-out', { admin: session.subject });
      response.writeHead(204, { ...BASE_HEADERS, ...SECURITY_HEADERS, 'Set-Cookie': clearedAdminSessionCookie() });
      response.end();
      return;
    }

    const admin = options.admin();
    if (!admin) {
      json(response, 503, { error: 'licensing-unavailable' });
      return;
    }

    if (pathname === ADMIN_PATHS.licenses) {
      if (request.method === 'GET') {
        result(response, await admin.search(new URL(request.url ?? '/', 'http://localhost').searchParams.get('q') ?? ''));
        return;
      }
      const body = await acceptChange(request, session);
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

    const body = await acceptChange(request, session);
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
      const isAuth = pathname === ADMIN_PATHS.login || pathname === ADMIN_PATHS.callback;
      const isApi = pathname === '/api/admin' || pathname.startsWith('/api/admin/');
      if (!isAuth && !isApi) return false;

      try {
        const limiter = isAuth ? loginLimiter : apiLimiter;
        const decision = limiter.consume(options.clientAddress(request));
        if (!decision.allowed) {
          json(response, 429, { error: 'rate-limited' }, { 'Retry-After': String(decision.retryAfterSeconds) });
          return true;
        }
        if (pathname === ADMIN_PATHS.login) login(request, response);
        else if (pathname === ADMIN_PATHS.callback) await callback(request, response);
        else await api(pathname, request, response);
      } catch (error) {
        if (error instanceof RequestError) {
          if (error.status === 405) response.setHeader('Allow', isAuth ? 'GET' : 'GET, POST');
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
