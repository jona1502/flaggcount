import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, resolve, sep } from 'node:path';
import type { AppError, AppState } from '../../../shared/appState';
import { DEFAULT_OVERLAY_SETTINGS } from '../../../shared/settings';
import type { VoteSnapshot } from '../../../shared/voting';
import { parseTelemetryEnvelope, type TelemetryEnvelope } from '../../../shared/analytics';
import { OVERLAY_CSP, renderOverlayPage } from '../overlay/overlayAssets';
import { parseOverlaySettings } from '../protocol';
import { channelIdForKey, isChannelId, isRelayKey, parseVoteSnapshot, relayOverlayPath } from '../relay/relayChannel';
import { BASE_HEADERS, keepAlive, openEventStream, send, sendJson, writeEvent } from '../server/http';
import { HEARTBEAT_MS, createOverlayHandler, isOverlayPath, type OverlaySource } from '../server/overlayRoutes';
import type { ReleaseInfo } from './latestRelease';
import type { RelayChannels } from './relayChannels';
import type { WaitlistResult } from './waitlistStore';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  SessionSigner,
  clearedSessionCookie,
  isCorrectPassword,
  readCookie,
  sessionCookie
} from './session';

export type CommandResult = Promise<AppError | null>;

/** Everything the web server needs from the app; implemented by `WebController`. */
export type WebBackend = OverlaySource & {
  getState: () => AppState;
  subscribeState: (listener: (state: AppState) => void) => () => void;
  subscribeErrors: (listener: (error: AppError) => void) => () => void;
  connect: (username: unknown) => CommandResult;
  disconnect: () => CommandResult;
  addManualVote: () => CommandResult;
  removeManualVote: () => CommandResult;
  resetVotes: () => CommandResult;
  setTarget: (target: unknown) => CommandResult;
  setOverlaySettings: (overlay: unknown) => CommandResult;
  setTelemetryEnabled: (enabled: unknown) => CommandResult;
};

export type WebServerOptions = {
  backend: WebBackend;
  password: string;
  /** Directory with the built landing page and dashboard; `null` serves only the overlay and the API. */
  webRoot: string | null;
  /** Newest desktop release for the landing page's download button. */
  latestRelease?: () => Promise<ReleaseInfo | null>;
  /** Where `/download` points while no release is known. */
  releasesUrl?: string;
  /** Online overlays mirrored from desktop apps, served at `/o/<channel>`. */
  relay?: RelayChannels;
  host?: string;
  port?: number;
  heartbeatMs?: number;
  maxFailedLogins?: number;
  lockoutMs?: number;
  sessionMaxAgeMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
  /** Receives an already validated, aggregate-only event. */
  onTelemetry?: (event: TelemetryEnvelope) => void;
  maxTelemetryEventsPerMinute?: number;
  waitlist?: {
    subscribe: (email: unknown, consent: unknown) => Promise<WaitlistResult>;
    unsubscribe: (email: unknown) => Promise<WaitlistResult>;
  };
  maxWaitlistRequestsPerMinute?: number;
};

export type WebServer = {
  port: number;
  close(): Promise<void>;
};

const MAX_BODY_BYTES = 4096;
const DEFAULT_MAX_FAILED_LOGINS = 10;
const DEFAULT_LOCKOUT_MS = 15 * 60_000;
const MAX_TRACKED_CLIENTS = 10_000;
const DEFAULT_MAX_TELEMETRY_EVENTS_PER_MINUTE = 60;
const DEFAULT_MAX_WAITLIST_REQUESTS_PER_MINUTE = 10;
const APP_ENTRY = '/web.html';
const RELAY_OVERLAY_PATH = /^\/o\/([^/]+)(\/events)?$/;
/** Shown by an online overlay until its app publishes for the first time. */
const WAITING_VOTES: VoteSnapshot = { count: 0, target: 100, roundId: '', targetReached: false };
/** Client-side routes of the web app: the landing page and the dashboard. */
const APP_ROUTES = new Set(['/', '/dashboard', '/dashboard/']);

const DASHBOARD_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY'
};

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/** The visitor's address as reported by Cloudflare or nginx, falling back to the socket. */
function clientAddress(request: IncomingMessage): string {
  const cloudflare = request.headers['cf-connecting-ip'];
  if (typeof cloudflare === 'string' && cloudflare) {
    return cloudflare;
  }
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0]?.trim() ?? forwarded;
  }
  return request.socket.remoteAddress ?? 'unknown';
}

/**
 * The session cookie is SameSite=Strict, so other sites cannot use it. A JSON body cannot be sent
 * cross-site without a CORS preflight, which this server never grants; the Origin check is a third line.
 */
function isSameOriginJson(request: IncomingMessage): boolean {
  const contentType = request.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return false;
  }
  const origin = request.headers.origin;
  if (origin === undefined) {
    return true;
  }
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) {
        chunks.push(chunk);
      }
    });
    request.on('end', () => {
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        return;
      }
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolveBody(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function bearerToken(header: string | undefined): string | null {
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

function field(body: unknown, key: string): unknown {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined;
}

function methodNotAllowed(response: ServerResponse, allow: string): void {
  response.setHeader('Allow', allow);
  sendJson(response, 405, { error: 'method-not-allowed' });
}

function sendNoContent(response: ServerResponse, headers: Record<string, string> = {}): void {
  response.writeHead(204, { ...BASE_HEADERS, ...headers });
  response.end();
}

/** Accepts only same-origin JSON POSTs; otherwise sends the error response and returns `null`. */
async function acceptPost(request: IncomingMessage, response: ServerResponse): Promise<{ body: unknown } | null> {
  if (request.method !== 'POST') {
    methodNotAllowed(response, 'POST');
    return null;
  }
  if (!isSameOriginJson(request)) {
    sendJson(response, 403, { error: 'forbidden' });
    return null;
  }
  try {
    return { body: await readJsonBody(request) };
  } catch {
    sendJson(response, 400, { code: 'unknown', message: 'Invalid request body' } satisfies AppError);
    return null;
  }
}

/** Locks out an address after repeated wrong passwords. */
class LoginLimiter {
  private readonly failures = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxFailures: number,
    private readonly lockoutMs: number,
    private readonly now: () => number
  ) {}

  retryAfterSeconds(client: string): number | null {
    const entry = this.failures.get(client);
    if (!entry) return null;
    const remainingMs = entry.resetAt - this.now();
    if (remainingMs <= 0) {
      this.failures.delete(client);
      return null;
    }
    return entry.count >= this.maxFailures ? Math.ceil(remainingMs / 1000) : null;
  }

  recordFailure(client: string): void {
    const now = this.now();
    const entry = this.failures.get(client);
    if (entry && entry.resetAt > now) {
      entry.count++;
      return;
    }
    if (this.failures.size >= MAX_TRACKED_CLIENTS) {
      this.failures.clear();
    }
    this.failures.set(client, { count: 1, resetAt: now + this.lockoutMs });
  }

  recordSuccess(client: string): void {
    this.failures.delete(client);
  }
}

/** An ephemeral address-based limiter; addresses are never included in telemetry or persisted. */
class FixedWindowLimiter {
  private readonly clients = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly maximum: number, private readonly now: () => number) {}

  accepts(client: string): boolean {
    const now = this.now();
    const current = this.clients.get(client);
    if (!current || current.resetAt <= now) {
      if (this.clients.size >= MAX_TRACKED_CLIENTS) this.clients.clear();
      this.clients.set(client, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    current.count++;
    return current.count <= this.maximum;
  }
}

/**
 * Serves the web version of FlagCount: the public landing page with the desktop download, the OBS
 * overlay, and the browser dashboard whose API and live state stream require a session login.
 * Meant to run behind nginx and Cloudflare.
 */
export async function startWebServer(options: WebServerOptions): Promise<WebServer> {
  const { backend, password } = options;
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  const webRoot = options.webRoot === null ? null : resolve(options.webRoot);
  const now = options.now ?? Date.now;
  const sessionMaxAgeMs = options.sessionMaxAgeMs ?? SESSION_MAX_AGE_MS;
  const overlay = createOverlayHandler(backend, heartbeatMs);
  const sessions = new SessionSigner(password, now, sessionMaxAgeMs);
  const limiter = new LoginLimiter(
    options.maxFailedLogins ?? DEFAULT_MAX_FAILED_LOGINS,
    options.lockoutMs ?? DEFAULT_LOCKOUT_MS,
    now
  );
  const telemetryLimiter = new FixedWindowLimiter(
    options.maxTelemetryEventsPerMinute ?? DEFAULT_MAX_TELEMETRY_EVENTS_PER_MINUTE,
    now
  );
  const waitlistLimiter = new FixedWindowLimiter(
    options.maxWaitlistRequestsPerMinute ?? DEFAULT_MAX_WAITLIST_REQUESTS_PER_MINUTE,
    now
  );

  const receiveTelemetry = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const accepted = await acceptPost(request, response);
    if (!accepted) return;
    if (!telemetryLimiter.accepts(clientAddress(request))) {
      sendJson(response, 429, { error: 'too-many-events' }, { 'Retry-After': '60' });
      return;
    }
    const event = parseTelemetryEnvelope(accepted.body);
    if (!event) {
      sendJson(response, 400, { error: 'invalid-event' });
      return;
    }
    options.onTelemetry?.(event);
    sendNoContent(response);
  };

  const updateWaitlist = async (
    unsubscribe: boolean,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> => {
    const accepted = await acceptPost(request, response);
    if (!accepted) return;
    if (!options.waitlist) {
      sendJson(response, 503, { error: 'waitlist-unavailable' });
      return;
    }
    if (!waitlistLimiter.accepts(clientAddress(request))) {
      sendJson(response, 429, { error: 'too-many-requests' }, { 'Retry-After': '60' });
      return;
    }
    const result = unsubscribe
      ? await options.waitlist.unsubscribe(field(accepted.body, 'email'))
      : await options.waitlist.subscribe(field(accepted.body, 'email'), field(accepted.body, 'consent'));
    switch (result) {
      case 'ok':
        sendNoContent(response);
        return;
      case 'invalid-email':
        sendJson(response, 400, { error: 'invalid-email' });
        return;
      case 'consent-required':
        sendJson(response, 400, { error: 'consent-required' });
        return;
      case 'full':
        sendJson(response, 503, { error: 'waitlist-full' });
    }
  };

  const commands = new Map<string, (body: unknown) => CommandResult>([
    ['/api/connect', (body) => backend.connect(field(body, 'username'))],
    ['/api/disconnect', () => backend.disconnect()],
    ['/api/manual-vote', () => backend.addManualVote()],
    ['/api/manual-vote/remove', () => backend.removeManualVote()],
    ['/api/reset', () => backend.resetVotes()],
    ['/api/target', (body) => backend.setTarget(field(body, 'target'))],
    ['/api/overlay', (body) => backend.setOverlaySettings(field(body, 'overlay'))],
    ['/api/telemetry', (body) => backend.setTelemetryEnabled(field(body, 'enabled'))]
  ]);

  const isSignedIn = (request: IncomingMessage): boolean =>
    sessions.verify(readCookie(request.headers.cookie, SESSION_COOKIE));

  const tooManyAttempts = (response: ServerResponse, retryAfter: number): void => {
    sendJson(response, 429, { error: 'too-many-attempts' }, { 'Retry-After': String(retryAfter) });
  };

  const login = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const client = clientAddress(request);
    const retryAfter = limiter.retryAfterSeconds(client);
    if (retryAfter !== null) {
      tooManyAttempts(response, retryAfter);
      return;
    }
    const accepted = await acceptPost(request, response);
    if (!accepted) return;

    if (!isCorrectPassword(field(accepted.body, 'password'), password)) {
      limiter.recordFailure(client);
      const lockedFor = limiter.retryAfterSeconds(client);
      if (lockedFor !== null) {
        tooManyAttempts(response, lockedFor);
      } else {
        sendJson(response, 401, { error: 'invalid-password' });
      }
      return;
    }
    limiter.recordSuccess(client);
    sendNoContent(response, { 'Set-Cookie': sessionCookie(sessions.create(), sessionMaxAgeMs) });
  };

  const streamState = (request: IncomingMessage, response: ServerResponse): void => {
    openEventStream(response);
    writeEvent(response, 'state', backend.getState());
    const unsubscribeState = backend.subscribeState((state) => writeEvent(response, 'state', state));
    // Not named "error": EventSource already uses that name for connection failures.
    const unsubscribeErrors = backend.subscribeErrors((error) => writeEvent(response, 'app-error', error));
    const stopHeartbeat = keepAlive(response, heartbeatMs);

    request.on('close', () => {
      stopHeartbeat();
      unsubscribeState();
      unsubscribeErrors();
    });
  };

  /** Desktop apps publish their state here; the key in the Authorization header must match the channel. */
  const publishRelay = async (channelId: string, request: IncomingMessage, response: ServerResponse) => {
    const relay = options.relay;
    if (!relay || !isChannelId(channelId)) {
      sendJson(response, 404, { error: 'not-found' });
      return;
    }
    if (request.method !== 'PUT') {
      methodNotAllowed(response, 'PUT');
      return;
    }
    const key = bearerToken(request.headers.authorization);
    if (!isRelayKey(key) || channelIdForKey(key) !== channelId) {
      sendJson(response, 401, { error: 'unauthorized' });
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch {
      sendJson(response, 400, { error: 'invalid-update' });
      return;
    }
    const votes = parseVoteSnapshot(field(body, 'votes'));
    const overlay = parseOverlaySettings(field(body, 'overlay'));
    if (!votes || !overlay) {
      sendJson(response, 400, { error: 'invalid-update' });
      return;
    }

    switch (relay.publish(channelId, { votes, overlay })) {
      case 'ok':
        sendNoContent(response);
        return;
      case 'rate-limited':
        sendJson(response, 429, { error: 'too-many-updates' }, { 'Retry-After': '10' });
        return;
      case 'full':
        sendJson(response, 503, { error: 'relay-full' });
    }
  };

  /** Public overlay page and event stream of one desktop app, e.g. for TikTok LIVE Studio. */
  const serveRelayOverlay = (
    relay: RelayChannels,
    channelId: string,
    events: boolean,
    request: IncomingMessage,
    response: ServerResponse
  ): void => {
    if (!isChannelId(channelId)) {
      sendJson(response, 404, { error: 'not-found' });
      return;
    }
    if (request.method !== 'GET') {
      methodNotAllowed(response, 'GET');
      return;
    }

    const current = relay.get(channelId);
    if (!events) {
      const page = renderOverlayPage(current?.votes ?? WAITING_VOTES, current?.overlay ?? DEFAULT_OVERLAY_SETTINGS, {
        eventsUrl: `${relayOverlayPath(channelId)}/events`
      });
      send(response, 200, 'text/html; charset=utf-8', page, { 'Content-Security-Policy': OVERLAY_CSP });
      return;
    }

    const unsubscribe = relay.subscribe(channelId, (update) => {
      writeEvent(response, 'settings', update.overlay);
      writeEvent(response, 'votes', update.votes);
    });
    if (!unsubscribe) {
      sendJson(response, 503, { error: 'too-many-viewers' });
      return;
    }
    openEventStream(response);
    if (current) {
      writeEvent(response, 'settings', current.overlay);
      writeEvent(response, 'votes', current.votes);
    }
    const stopHeartbeat = keepAlive(response, heartbeatMs);
    request.on('close', () => {
      stopHeartbeat();
      unsubscribe();
    });
  };

  const handleApi = async (pathname: string, request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (pathname === '/api/v1/analytics/events') {
      await receiveTelemetry(request, response);
      return;
    }
    if (pathname === '/api/v1/waitlist' || pathname === '/api/v1/waitlist/unsubscribe') {
      await updateWaitlist(pathname.endsWith('/unsubscribe'), request, response);
      return;
    }
    if (pathname.startsWith('/api/relay/')) {
      await publishRelay(pathname.slice('/api/relay/'.length), request, response);
      return;
    }

    switch (pathname) {
      case '/api/release':
        if (request.method !== 'GET') {
          methodNotAllowed(response, 'GET');
        } else {
          sendJson(response, 200, { release: (await options.latestRelease?.()) ?? null });
        }
        return;
      case '/api/session':
        if (request.method !== 'GET') {
          methodNotAllowed(response, 'GET');
        } else {
          sendJson(response, 200, { authenticated: isSignedIn(request) });
        }
        return;
      case '/api/login':
        await login(request, response);
        return;
      case '/api/logout':
        // Works without a valid session too, so an expired cookie can always be cleared.
        if (await acceptPost(request, response)) {
          sendNoContent(response, { 'Set-Cookie': clearedSessionCookie() });
        }
        return;
    }

    if (!isSignedIn(request)) {
      // Deliberately no WWW-Authenticate header: the browser must not show its own login dialog.
      sendJson(response, 401, { error: 'unauthorized' });
      return;
    }

    if (pathname === '/api/state' || pathname === '/api/events') {
      if (request.method !== 'GET') {
        methodNotAllowed(response, 'GET');
      } else if (pathname === '/api/state') {
        sendJson(response, 200, backend.getState());
      } else {
        streamState(request, response);
      }
      return;
    }

    const command = commands.get(pathname);
    if (!command) {
      sendJson(response, 404, { error: 'not-found' });
      return;
    }
    const accepted = await acceptPost(request, response);
    if (!accepted) return;

    const error = await command(accepted.body);
    if (error) {
      sendJson(response, 400, error);
    } else {
      sendNoContent(response);
    }
  };

  const serveStatic = async (root: string, pathname: string, request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      methodNotAllowed(response, 'GET, HEAD');
      return;
    }

    let relativePath: string;
    try {
      relativePath = decodeURIComponent(APP_ROUTES.has(pathname) ? APP_ENTRY : pathname);
    } catch {
      sendJson(response, 404, { error: 'not-found' });
      return;
    }
    const file = resolve(root, `.${relativePath}`);
    const info = file.startsWith(root + sep) ? await stat(file).catch(() => null) : null;
    if (!info?.isFile()) {
      sendJson(response, 404, { error: 'not-found' });
      return;
    }

    const extension = extname(file);
    const headers: Record<string, string> =
      extension === '.html'
        ? DASHBOARD_HEADERS
        : relativePath.startsWith('/assets/')
          ? // Hashed file names never change. "private" keeps Cloudflare from caching them for others.
            { 'Cache-Control': 'private, max-age=31536000, immutable' }
          : {};
    const body = request.method === 'HEAD' ? '' : await readFile(file);
    send(response, 200, CONTENT_TYPES[extension] ?? 'application/octet-stream', body, headers);
  };

  const redirectToDownload = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      methodNotAllowed(response, 'GET, HEAD');
      return;
    }
    const release = await options.latestRelease?.();
    const location = release?.downloadUrl ?? options.releasesUrl;
    if (!location) {
      sendJson(response, 404, { error: 'not-found' });
      return;
    }
    response.writeHead(302, { ...BASE_HEADERS, Location: location });
    response.end();
  };

  const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');

    if (pathname === '/healthz') {
      send(response, 200, 'text/plain; charset=utf-8', 'ok');
      return;
    }
    // The overlay only shows the vote count and must load in OBS without a login.
    if (isOverlayPath(pathname)) {
      overlay(pathname, request, response);
      return;
    }
    const relayOverlay = RELAY_OVERLAY_PATH.exec(pathname);
    if (relayOverlay && options.relay) {
      serveRelayOverlay(options.relay, relayOverlay[1] ?? '', Boolean(relayOverlay[2]), request, response);
      return;
    }
    // Stable link to the newest installer, whose file name contains the version.
    if (pathname === '/download') {
      await redirectToDownload(request, response);
      return;
    }

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      await handleApi(pathname, request, response);
    } else if (webRoot) {
      // The app bundle contains no data; the dashboard shows the login screen until the API accepts a session.
      await serveStatic(webRoot, pathname, request, response);
    } else {
      sendJson(response, 404, { error: 'not-found' });
    }
  };

  const server = createServer((request, response) => {
    handleRequest(request, response).catch((error: unknown) => {
      options.onError?.(error);
      if (response.headersSent) {
        response.end();
      } else {
        sendJson(response, 500, { error: 'internal' });
      }
    });
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', () => {
      server.off('error', reject);
      resolveListen();
    });
  });

  return {
    port: (server.address() as AddressInfo).port,
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolveClose()));
      })
  };
}
