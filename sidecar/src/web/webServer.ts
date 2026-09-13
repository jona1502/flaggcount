import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, resolve, sep } from 'node:path';
import type { AppError, AppState } from '../../../shared/appState';
import { BASE_HEADERS, keepAlive, openEventStream, send, sendJson, writeEvent } from '../server/http';
import { HEARTBEAT_MS, createOverlayHandler, isOverlayPath, type OverlaySource } from '../server/overlayRoutes';

export type CommandResult = Promise<AppError | null>;

/** Everything the web server needs from the app; implemented by `WebController`. */
export type WebBackend = OverlaySource & {
  getState: () => AppState;
  subscribeState: (listener: (state: AppState) => void) => () => void;
  subscribeErrors: (listener: (error: AppError) => void) => () => void;
  connect: (username: unknown) => CommandResult;
  disconnect: () => CommandResult;
  addManualVote: () => CommandResult;
  resetVotes: () => CommandResult;
  setTarget: (target: unknown) => CommandResult;
  setOverlaySettings: (overlay: unknown) => CommandResult;
};

export type WebServerOptions = {
  backend: WebBackend;
  password: string;
  /** Directory with the built browser dashboard; `null` serves only the overlay and the API. */
  webRoot: string | null;
  host?: string;
  port?: number;
  heartbeatMs?: number;
  maxFailedLogins?: number;
  lockoutMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
};

export type WebServer = {
  port: number;
  close(): Promise<void>;
};

const MAX_BODY_BYTES = 4096;
const DEFAULT_MAX_FAILED_LOGINS = 10;
const DEFAULT_LOCKOUT_MS = 15 * 60_000;
const MAX_TRACKED_CLIENTS = 10_000;
const DASHBOARD_ENTRY = '/web.html';

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

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Checks HTTP Basic credentials. The user name is ignored; only the password counts. */
export function isAuthorizedPassword(header: string | undefined, password: string): boolean {
  if (!header?.startsWith('Basic ')) {
    return false;
  }
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) {
    return false;
  }
  // Fixed-length digests keep the comparison constant-time for any input length.
  return timingSafeEqual(digest(decoded.slice(separator + 1)), digest(password));
}

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
 * Browsers attach Basic credentials to cross-site requests too. A JSON body cannot be sent
 * cross-site without a CORS preflight, which this server never grants; the Origin check is a second line.
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

function field(body: unknown, key: string): unknown {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined;
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

/**
 * Serves the web version of FlagCount: the public OBS overlay, and behind a password the
 * browser dashboard with its API and live state stream. Meant to run behind nginx and Cloudflare.
 */
export async function startWebServer(options: WebServerOptions): Promise<WebServer> {
  const { backend, password } = options;
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  const webRoot = options.webRoot === null ? null : resolve(options.webRoot);
  const overlay = createOverlayHandler(backend, heartbeatMs);
  const limiter = new LoginLimiter(
    options.maxFailedLogins ?? DEFAULT_MAX_FAILED_LOGINS,
    options.lockoutMs ?? DEFAULT_LOCKOUT_MS,
    options.now ?? Date.now
  );

  const commands = new Map<string, (body: unknown) => CommandResult>([
    ['/api/connect', (body) => backend.connect(field(body, 'username'))],
    ['/api/disconnect', () => backend.disconnect()],
    ['/api/manual-vote', () => backend.addManualVote()],
    ['/api/reset', () => backend.resetVotes()],
    ['/api/target', (body) => backend.setTarget(field(body, 'target'))],
    ['/api/overlay', (body) => backend.setOverlaySettings(field(body, 'overlay'))]
  ]);

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

  const handleApi = async (pathname: string, request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (pathname === '/api/state' || pathname === '/api/events') {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        sendJson(response, 405, { error: 'method-not-allowed' });
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
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      sendJson(response, 405, { error: 'method-not-allowed' });
      return;
    }
    if (!isSameOriginJson(request)) {
      sendJson(response, 403, { error: 'forbidden' });
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch {
      sendJson(response, 400, { code: 'unknown', message: 'Invalid request body' } satisfies AppError);
      return;
    }

    const error = await command(body);
    if (error) {
      sendJson(response, 400, error);
    } else {
      response.writeHead(204, BASE_HEADERS);
      response.end();
    }
  };

  const serveStatic = async (root: string, pathname: string, request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      sendJson(response, 405, { error: 'method-not-allowed' });
      return;
    }

    let relativePath: string;
    try {
      relativePath = decodeURIComponent(pathname === '/' ? DASHBOARD_ENTRY : pathname);
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

    const client = clientAddress(request);
    const retryAfter = limiter.retryAfterSeconds(client);
    if (retryAfter !== null) {
      sendJson(response, 429, { error: 'too-many-attempts' }, { 'Retry-After': String(retryAfter) });
      return;
    }
    const authorization = request.headers.authorization;
    if (!isAuthorizedPassword(authorization, password)) {
      // The browser's first request carries no credentials; only wrong passwords count.
      if (authorization) limiter.recordFailure(client);
      sendJson(response, 401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Basic realm="FlagCount", charset="UTF-8"' });
      return;
    }
    limiter.recordSuccess(client);

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      await handleApi(pathname, request, response);
    } else if (webRoot) {
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
