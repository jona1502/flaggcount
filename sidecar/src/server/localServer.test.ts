import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createSessionToken, isAuthorized, startLocalServer, type LocalServer } from './localServer';

const TOKEN = 'a'.repeat(64);
let server: LocalServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

async function start(): Promise<LocalServer> {
  server = await startLocalServer({ token: TOKEN, getState: () => ({ ok: true }) });
  return server;
}

type RequestOptions = {
  path?: string;
  method?: string;
  host?: string;
  authorization?: string | null;
};

function send(
  port: number,
  { path = '/api/state', method = 'GET', host = `127.0.0.1:${port}`, authorization = `Bearer ${TOKEN}` }: RequestOptions = {}
): Promise<{ status: number; body: unknown; headers: IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { host };
    if (authorization) {
      headers['authorization'] = authorization;
    }
    const request = httpRequest({ host: '127.0.0.1', port, path, method, headers, agent: false }, (response) => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (data += chunk));
      response.on('end', () =>
        resolve({ status: response.statusCode ?? 0, body: data ? JSON.parse(data) : null, headers: response.headers })
      );
    });
    request.on('error', reject);
    request.end();
  });
}

describe('startLocalServer', () => {
  it('listens on the loopback interface only', async () => {
    const { address, port } = await start();

    expect(address).toBe('127.0.0.1');
    expect(port).toBeGreaterThan(0);
  });

  it('returns the state for authenticated requests', async () => {
    const { port } = await start();

    const response = await send(port);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('accepts localhost as host name', async () => {
    const { port } = await start();

    expect((await send(port, { host: `localhost:${port}` })).status).toBe(200);
  });

  it.each([null, 'Bearer wrong', `Bearer ${TOKEN}x`, `Basic ${TOKEN}`, TOKEN])(
    'rejects the authorization header %j',
    async (authorization) => {
      const { port } = await start();

      expect((await send(port, { authorization })).status).toBe(401);
    }
  );

  it('rejects foreign host headers to prevent DNS rebinding', async () => {
    const { port } = await start();

    expect((await send(port, { host: `evil.example:${port}` })).status).toBe(403);
    expect((await send(port, { host: 'evil.example' })).status).toBe(403);
  });

  it('checks authentication before revealing routes', async () => {
    const { port } = await start();

    expect((await send(port, { path: '/unknown', authorization: null })).status).toBe(401);
    expect((await send(port, { path: '/unknown' })).status).toBe(404);
  });

  it('only allows GET for the state endpoint', async () => {
    const { port } = await start();

    const response = await send(port, { method: 'POST' });

    expect(response.status).toBe(405);
    expect(response.headers['allow']).toBe('GET');
  });
});

describe('isAuthorized', () => {
  it('accepts only the exact bearer token', () => {
    expect(isAuthorized(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(isAuthorized(undefined, TOKEN)).toBe(false);
    expect(isAuthorized('Bearer ', TOKEN)).toBe(false);
    expect(isAuthorized(`bearer ${TOKEN}`, TOKEN)).toBe(false);
  });
});

describe('createSessionToken', () => {
  it('creates a new 256-bit hex token each time', () => {
    const first = createSessionToken();

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(createSessionToken()).not.toBe(first);
  });
});
