import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sendJson } from './http';
import { createOverlayHandler, isOverlayPath, type OverlaySource } from './overlayRoutes';

export const LOOPBACK_HOST = '127.0.0.1';
/** Stable default so the streaming overlay URL survives app restarts. */
export const DEFAULT_OVERLAY_PORT = 3847;

export type LocalServerOptions = OverlaySource & {
  token: string;
  getState: () => unknown;
  heartbeatMs?: number;
  onOverlayOpened?: () => void;
};

export type LocalServer = {
  address: string;
  port: number;
  close(): Promise<void>;
};

/** A new random secret for every app start. */
export function createSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function isAuthorized(header: string | undefined, token: string): boolean {
  const prefix = 'Bearer ';
  if (!header?.startsWith(prefix)) {
    return false;
  }
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(token);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function isLoopbackAddress(address: string | undefined): boolean {
  return address === LOOPBACK_HOST || address === `::ffff:${LOOPBACK_HOST}`;
}

function isAllowedHost(host: string | undefined, port: number): boolean {
  return host === `${LOOPBACK_HOST}:${port}` || host === `localhost:${port}`;
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK_HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

/**
 * Starts the sidecar's HTTP server, reachable only from this machine. The streaming overlay
 * is public on loopback (it only shows the vote count); the API requires the session token.
 */
export async function startLocalServer(options: LocalServerOptions, preferredPort = 0): Promise<LocalServer> {
  let boundPort = 0;
  const handleOverlay = createOverlayHandler(options, options.heartbeatMs);

  const handleRequest = (request: IncomingMessage, response: ServerResponse): void => {
    // The socket only listens on loopback; the Host check additionally blocks DNS rebinding.
    if (!isLoopbackAddress(request.socket.remoteAddress) || !isAllowedHost(request.headers.host, boundPort)) {
      sendJson(response, 403, { error: 'forbidden' });
      return;
    }

    const { pathname } = new URL(request.url ?? '/', `http://${LOOPBACK_HOST}`);
    if (isOverlayPath(pathname)) {
      if (pathname === '/overlay' && request.method === 'GET') options.onOverlayOpened?.();
      handleOverlay(pathname, request, response);
      return;
    }

    if (!isAuthorized(request.headers.authorization, options.token)) {
      sendJson(response, 401, { error: 'unauthorized' });
      return;
    }
    if (pathname !== '/api/state') {
      sendJson(response, 404, { error: 'not-found' });
      return;
    }
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      sendJson(response, 405, { error: 'method-not-allowed' });
      return;
    }

    sendJson(response, 200, options.getState());
  };

  let server = createServer(handleRequest);
  try {
    await listen(server, preferredPort);
  } catch (error) {
    if (preferredPort === 0 || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
      throw error;
    }
    // Another program already uses the preferred port: fall back to any free port.
    server = createServer(handleRequest);
    await listen(server, 0);
  }

  const address = server.address() as AddressInfo;
  boundPort = address.port;
  const activeServer = server;

  return {
    address: address.address,
    port: boundPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        activeServer.closeAllConnections();
        activeServer.close((error) => (error ? reject(error) : resolve()));
      })
  };
}
