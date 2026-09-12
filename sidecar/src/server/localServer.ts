import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export const LOOPBACK_HOST = '127.0.0.1';

export type LocalServerOptions = {
  token: string;
  getState: () => unknown;
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

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(body));
}

/** Starts the sidecar's HTTP server, reachable only from this machine and only with the session token. */
export async function startLocalServer(options: LocalServerOptions, port = 0): Promise<LocalServer> {
  let boundPort = port;

  const handleRequest = (request: IncomingMessage, response: ServerResponse): void => {
    // The socket only listens on loopback; the Host check additionally blocks DNS rebinding.
    if (!isLoopbackAddress(request.socket.remoteAddress) || !isAllowedHost(request.headers.host, boundPort)) {
      sendJson(response, 403, { error: 'forbidden' });
      return;
    }
    if (!isAuthorized(request.headers.authorization, options.token)) {
      sendJson(response, 401, { error: 'unauthorized' });
      return;
    }

    const { pathname } = new URL(request.url ?? '/', `http://${LOOPBACK_HOST}`);
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

  const server = createServer(handleRequest);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK_HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  boundPort = address.port;

  return {
    address: address.address,
    port: boundPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}
