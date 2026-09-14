// Which service answers a path behind the reverse proxy. Mirrors deploy/Caddyfile and docs/WEB_ROUTING.md;
// scripts/web-routes.test.ts checks that the Caddyfile and this table agree.

/** Paths answered by the backend: APIs, overlays, relay, webhooks and operations. */
export const BACKEND_EXACT = ['/api', '/overlay', '/healthz', '/readyz', '/download'];
export const BACKEND_PREFIXES = ['/api/', '/overlay/', '/o/', '/ob/'];

/**
 * The previous Vite dashboard, still served by the backend until it runs on Next.js. Removed together with
 * the legacy web client. The admin area already belongs to Next.js.
 */
export const LEGACY_EXACT = ['/dashboard', '/dashboard/', '/web.html'];
export const LEGACY_PREFIXES = ['/assets/'];

/** Server-Sent Events streams, which must be forwarded without buffering. */
export const EVENT_STREAM = /^\/(api\/events|overlay(\/.+)?\/events|o\/[^/]+\/events|ob\/[^/]+\/events)$/;

export const WEBHOOK_PREFIX = '/api/v1/billing/webhooks/';

const matches = (pathname, exact, prefixes) => exact.includes(pathname) || prefixes.some((prefix) => pathname.startsWith(prefix));

/** `backend` or `web` for a request path. */
export function routeTarget(pathname) {
  if (matches(pathname, BACKEND_EXACT, BACKEND_PREFIXES)) return 'backend';
  if (matches(pathname, LEGACY_EXACT, LEGACY_PREFIXES)) return 'backend';
  return 'web';
}

/** Largest accepted request body in bytes; `null` leaves it to Next.js. */
export function bodyLimit(pathname) {
  if (pathname.startsWith(WEBHOOK_PREFIX)) return 1_000_000;
  return routeTarget(pathname) === 'backend' ? 64_000 : null;
}
