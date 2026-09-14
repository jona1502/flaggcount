import 'server-only';
import {
  ADMIN_LOGIN_COOKIE,
  ADMIN_SESSION_COOKIE,
  adminLoginCookie,
  adminSessionCookie,
  clearedAdminLoginCookie,
  clearedAdminSessionCookie,
  safeEqual
} from '../../../../sidecar/src/web/admin/adminAuth';
import { readCookie } from '../../../../sidecar/src/web/session';
import { isTrustedProxyAddress } from '../../../../sidecar/src/web/clientAddress';
import type { AdminRuntime } from './runtime';

/** Pages of the login flow contain no script and load nothing. */
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function baseHeaders(cookies: string[] = []): Headers {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return headers;
}

function page(status: number, title: string, text: string, cookies: string[] = [], continueTo?: string): Response {
  const escape = (value: string) => value.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);
  const target = continueTo ?? '/admin/login';
  const body = [
    '<!doctype html><html lang="de"><head><meta charset="utf-8">',
    continueTo ? `<meta http-equiv="refresh" content="0;url=${escape(continueTo)}">` : '',
    `<title>${escape(title)}</title>`,
    '<style>body{font-family:system-ui,sans-serif;background:#111115;color:#f4f4f6;display:grid;place-items:center;min-height:100vh;margin:0}a{color:#f43b49}</style>',
    `</head><body><main><h1>${escape(title)}</h1><p>${escape(text)}</p><p><a href="${escape(target)}">Weiter</a></p></main></body></html>`
  ].join('');
  const headers = baseHeaders(cookies);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Content-Security-Policy', PAGE_CSP);
  return new Response(body, { status, headers });
}

/** The visitor behind the proxies, for rate limits: the rightmost forwarded address that is not a proxy. */
export function visitorKey(request: Request): string {
  const forwarded = (request.headers.get('x-forwarded-for') ?? '').split(',').map((address) => address.trim()).filter(Boolean);
  return [...forwarded].reverse().find((address) => !isTrustedProxyAddress(address)) ?? forwarded[0] ?? 'unknown';
}

function limited(runtime: AdminRuntime, request: Request): Response | null {
  const decision = runtime.loginLimiter.consume(visitorKey(request));
  if (decision.allowed) return null;
  const response = page(429, 'Zu viele Versuche', 'Bitte warte ein paar Minuten und versuche es dann erneut.');
  response.headers.set('Retry-After', String(decision.retryAfterSeconds));
  return response;
}

/** A change must come from a page of this site: the Origin header has to match the requested host. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const hosts = [request.headers.get('x-forwarded-host'), request.headers.get('host')].filter(Boolean);
  if (!origin || hosts.length === 0) return false;
  try {
    return hosts.includes(new URL(origin).host);
  } catch {
    return false;
  }
}

/** Starts the GitHub login: `state` binds the callback to this browser, the PKCE verifier to this server. */
export function startLogin(runtime: AdminRuntime, request: Request): Response {
  const tooMany = limited(runtime, request);
  if (tooMany) return tooMany;
  const { state, challenge } = runtime.sessions.beginLogin();
  const headers = baseHeaders([adminLoginCookie(state)]);
  headers.set('Location', runtime.oauth.authorizeUrl(state, challenge));
  return new Response(null, { status: 302, headers });
}

/** Handles GitHub's redirect back: checks state, account id and allowlist, then creates the session. */
export async function finishLogin(runtime: AdminRuntime, request: Request): Promise<Response> {
  const tooMany = limited(runtime, request);
  if (tooMany) return tooMany;
  const { logger } = runtime;
  const query = new URL(request.url).searchParams;
  const state = query.get('state') ?? '';
  const code = query.get('code') ?? '';
  const cookieState = readCookie(request.headers.get('cookie') ?? undefined, ADMIN_LOGIN_COOKIE);
  const clearLogin = [clearedAdminLoginCookie()];

  // The state must come back to the browser that started the login, and only once.
  const verifier = cookieState && safeEqual(state, cookieState) ? runtime.sessions.finishLogin(state) : null;
  if (!verifier || !code || code.length > 256) {
    logger('warn', 'admin-login-rejected', { reason: 'invalid-state' });
    return page(400, 'Anmeldung abgelaufen', 'Bitte starte die Anmeldung erneut.', clearLogin);
  }

  let account: { id: string; login: string };
  try {
    account = await runtime.oauth.identify(code, verifier);
  } catch (error) {
    logger('error', 'admin-login-failed', { error: error instanceof Error ? error.name : typeof error });
    return page(502, 'Anmeldung fehlgeschlagen', 'GitHub ist gerade nicht erreichbar. Bitte versuche es später erneut.', clearLogin);
  }
  if (!runtime.config.allowedUserIds.has(account.id)) {
    logger('warn', 'admin-login-rejected', { reason: 'not-allowed' });
    return page(403, 'Kein Zugriff', 'Dieses GitHub-Konto ist nicht für den Admin-Bereich freigegeben.', clearLogin);
  }

  const { token } = runtime.sessions.create(`github:${account.id}`, account.login);
  logger('info', 'admin-signed-in', { admin: `github:${account.id}` });
  // GitHub's redirect is cross-site, so the SameSite=Strict cookie would not be sent with a direct redirect.
  // This page on our own origin navigates on, and that request carries the cookie.
  return page(200, 'Angemeldet', 'Du wirst zum Admin-Bereich weitergeleitet.', [adminSessionCookie(token), clearedAdminLoginCookie()], '/admin');
}

/** Ends the session; needs a same-origin form post with the session's CSRF token. */
export async function logout(runtime: AdminRuntime, request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403, headers: baseHeaders() });
  const token = readCookie(request.headers.get('cookie') ?? undefined, ADMIN_SESSION_COOKIE);
  const session = runtime.sessions.verify(token);
  if (session) {
    const form = await request.formData().catch(() => null);
    if (!safeEqual(form?.get('csrfToken'), session.csrfToken)) return new Response('Forbidden', { status: 403, headers: baseHeaders() });
    runtime.sessions.destroy(token);
    runtime.logger('info', 'admin-signed-out', { admin: session.subject });
  }
  const headers = baseHeaders([clearedAdminSessionCookie()]);
  headers.set('Location', '/admin/login');
  return new Response(null, { status: 303, headers });
}
