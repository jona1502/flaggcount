import type { IncomingMessage, ServerResponse } from 'node:http';
import { BASE_HEADERS, sendJson } from '../../server/http';
import { readCookie } from '../session';
import type { StructuredLogger } from '../structuredLog';
import type { AdminError, AdminResult, AdminService } from '../licensing/adminService';
import { RateLimiter } from '../licensing/rateLimiter';
import { ADMIN_ASSERTION_HEADER, type AdminAssertionVerifier } from './adminAssertion';
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
  whoami: '/api/admin/whoami',
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
  /** Handles `/api/admin/…` and, with the legacy login, `/admin/auth/…`; `false` for other paths. */
  handle(pathname: string, request: IncomingMessage, response: ServerResponse): Promise<boolean>;
};

export type AdminHandlerOptions = {
  /**
   * Legacy GitHub login with cookie sessions, served by the backend until the Next.js admin dashboard replaces
   * it. Without it, only assertion-authenticated requests are accepted.
   */
  login?: {
    config: AdminConfig;
    sessions: AdminSessions;
    oauth: Pick<GitHubOAuth, 'authorizeUrl' | 'identify'>;
  };
  /** Verifies the signed proof the Next.js web container sends for its authenticated administrators. */
  assertions?: AdminAssertionVerifier;
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

function page(
  response: ServerResponse,
  status: number,
  title: string,
  text: string,
  headers: Record<string, string | string[]> = {},
  refresh = false
): void {
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

type Caller = { subject: string; session: AdminSession | null; token: string | undefined };

/**
 * The admin API. Every request needs an administrator: either a signed assertion from the Next.js web container
 * (the target setup) or, while the legacy login exists, a cookie session with a CSRF token for changes. The API
 * also enforces rate limits and body limits; the audit log is written by the admin service.
 */
export function createAdminHandler(options: AdminHandlerOptions): AdminHandler {
  const { login, logger } = options;
  const now = options.now ?? Date.now;
  const loginLimiter = new RateLimiter({ limit: 20, windowMs: 15 * MINUTE, now });
  const apiLimiter = new RateLimiter({ limit: 300, windowMs: 5 * MINUTE, now });

  const json = (response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) =>
    sendJson(response, status, body, { ...SECURITY_HEADERS, ...headers });

  const result = <T>(response: ServerResponse, outcome: AdminResult<T>, status = 200) => {
    if (outcome.ok) json(response, status, outcome.value);
    else json(response, ERROR_STATUS[outcome.error], { error: outcome.error });
  };

  /** `null` if the request carries no valid administrator; a present but invalid assertion never falls back. */
  const authenticate = (pathname: string, request: IncomingMessage): Caller | null => {
    const assertion = request.headers[ADMIN_ASSERTION_HEADER];
    if (assertion !== undefined) {
      const verification = options.assertions?.verify(assertion, { method: request.method ?? 'GET', path: pathname });
      if (!verification?.ok) {
        logger('warn', 'admin-assertion-rejected', { reason: verification?.reason ?? 'not-configured' });
        return null;
      }
      return { subject: verification.claims.sub, session: null, token: undefined };
    }
    if (!login) return null;
    const token = readCookie(request.headers.cookie, ADMIN_SESSION_COOKIE);
    const session = login.sessions.verify(token);
    return session ? { subject: session.subject, session, token } : null;
  };

  /** Changes need a JSON body; cookie sessions additionally need their CSRF token and a same-origin request. */
  const acceptChange = async (request: IncomingMessage, caller: Caller): Promise<Record<string, unknown>> => {
    if (request.method !== 'POST') throw new RequestError(405, 'method-not-allowed');
    if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw new RequestError(415, 'unsupported-media-type');
    if (caller.session) {
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
      if (!safeEqual(request.headers[CSRF_HEADER], caller.session.csrfToken)) throw new RequestError(403, 'invalid-csrf-token');
    }
    return readBody(request);
  };

  const startLogin = (active: NonNullable<AdminHandlerOptions['login']>, request: IncomingMessage, response: ServerResponse): void => {
    if (request.method !== 'GET') throw new RequestError(405, 'method-not-allowed');
    const { state, challenge } = active.sessions.beginLogin();
    response.writeHead(302, {
      ...BASE_HEADERS,
      ...SECURITY_HEADERS,
      Location: active.oauth.authorizeUrl(state, challenge),
      'Set-Cookie': adminLoginCookie(state)
    });
    response.end();
  };

  const callback = async (active: NonNullable<AdminHandlerOptions['login']>, request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== 'GET') throw new RequestError(405, 'method-not-allowed');
    const query = new URL(request.url ?? '/', 'http://localhost').searchParams;
    const state = query.get('state') ?? '';
    const code = query.get('code') ?? '';
    const cookieState = readCookie(request.headers.cookie, ADMIN_LOGIN_COOKIE);
    const clearLogin = { 'Set-Cookie': clearedAdminLoginCookie() };

    // The state must come back to the browser that started the login, and only once.
    const verifier = cookieState && safeEqual(state, cookieState) ? active.sessions.finishLogin(state) : null;
    if (!verifier || !code || code.length > 256) {
      logger('warn', 'admin-login-rejected', { reason: 'invalid-state' });
      page(response, 400, 'Anmeldung abgelaufen', 'Bitte starte die Anmeldung erneut.', clearLogin);
      return;
    }

    let account: { id: string; login: string };
    try {
      account = await active.oauth.identify(code, verifier);
    } catch (error) {
      logger('error', 'admin-login-failed', { error: error instanceof Error ? error.name : typeof error });
      page(response, 502, 'Anmeldung fehlgeschlagen', 'GitHub ist gerade nicht erreichbar. Bitte versuche es später erneut.', clearLogin);
      return;
    }
    if (!active.config.allowedUserIds.has(account.id)) {
      logger('warn', 'admin-login-rejected', { reason: 'not-allowed' });
      page(response, 403, 'Kein Zugriff', 'Dieses GitHub-Konto ist nicht für den Admin-Bereich freigegeben.', clearLogin);
      return;
    }

    const { token } = active.sessions.create(`github:${account.id}`, account.login);
    logger('info', 'admin-signed-in', { admin: `github:${account.id}` });
    // A page on this origin navigates on, so the SameSite=Strict cookie is sent with the next request.
    page(
      response,
      200,
      'Angemeldet',
      'Du wirst zum Admin-Bereich weitergeleitet.',
      { 'Set-Cookie': [adminSessionCookie(token), clearedAdminLoginCookie()] },
      true
    );
  };

  const api = async (pathname: string, request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const caller = authenticate(pathname, request);

    if (pathname === ADMIN_PATHS.session) {
      if (request.method !== 'GET') throw new RequestError(405, 'method-not-allowed');
      const session = caller?.session;
      json(
        response,
        200,
        session && login
          ? { authenticated: true, login: session.login, subject: session.subject, csrfToken: session.csrfToken, expiresAt: new Date(login.sessions.expiresAt(session)).toISOString() }
          : { authenticated: false }
      );
      return;
    }
    if (!caller) {
      json(response, 401, { error: 'unauthorized' });
      return;
    }
    const actor = { subject: caller.subject };

    if (pathname === ADMIN_PATHS.whoami) {
      if (request.method !== 'GET') throw new RequestError(405, 'method-not-allowed');
      json(response, 200, { subject: caller.subject });
      return;
    }

    if (pathname === ADMIN_PATHS.logout) {
      await acceptChange(request, caller);
      login?.sessions.destroy(caller.token);
      logger('info', 'admin-signed-out', { admin: caller.subject });
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
      const body = await acceptChange(request, caller);
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

    const body = await acceptChange(request, caller);
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
      const isAuth = login !== undefined && (pathname === ADMIN_PATHS.login || pathname === ADMIN_PATHS.callback);
      const isApi = pathname === '/api/admin' || pathname.startsWith('/api/admin/');
      if (!isAuth && !isApi) return false;

      try {
        const limiter = isAuth ? loginLimiter : apiLimiter;
        const decision = limiter.consume(options.clientAddress(request));
        if (!decision.allowed) {
          json(response, 429, { error: 'rate-limited' }, { 'Retry-After': String(decision.retryAfterSeconds) });
          return true;
        }
        if (login && pathname === ADMIN_PATHS.login) startLogin(login, request, response);
        else if (login && pathname === ADMIN_PATHS.callback) await callback(login, request, response);
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
