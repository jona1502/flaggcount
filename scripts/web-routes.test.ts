import { readFileSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Plain JavaScript scripts without type declarations.
import { createDevProxy } from './dev-proxy.mjs';
// @ts-expect-error Plain JavaScript scripts without type declarations.
import { BACKEND_EXACT, BACKEND_PREFIXES, EVENT_STREAM, LEGACY_EXACT, LEGACY_PREFIXES, bodyLimit, routeTarget } from './web-routes.mjs';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe('route table', () => {
  it('sends APIs, overlays, relay, webhooks and operations to the backend', () => {
    for (const path of [
      '/api',
      '/api/state',
      '/api/events',
      '/api/v1/billing/webhooks/stripe',
      '/api/admin/licenses',
      '/overlay',
      '/overlay/events',
      '/overlay/counter/abc/events',
      '/o/channel1',
      '/ob/channel1/events',
      '/healthz',
      '/readyz',
      '/download'
    ]) {
      expect(routeTarget(path), path).toBe('backend');
    }
  });

  it('sends the website to Next.js', () => {
    for (const path of ['/', '/pro', '/pro/erfolgreich', '/herunterladen', '/datenschutz', '/health', '/sitemap.xml', '/_next/static/chunk.js', '/downloads', '/overlayx', '/api-docs']) {
      expect(routeTarget(path), path).toBe('web');
    }
  });

  it('keeps the legacy dashboard and admin area on the backend until they are migrated', () => {
    for (const path of ['/dashboard', '/admin', '/admin/auth/callback', '/admin.html', '/assets/web-abc.js']) {
      expect(routeTarget(path), path).toBe('backend');
    }
  });

  it('recognizes event streams and body limits', () => {
    expect(['/api/events', '/overlay/events', '/overlay/all/events', '/o/x/events', '/ob/x/events'].every((path) => EVENT_STREAM.test(path))).toBe(true);
    expect(['/api/state', '/o/x', '/o/x/y/events'].some((path) => EVENT_STREAM.test(path))).toBe(false);
    expect(bodyLimit('/api/v1/billing/webhooks/stripe')).toBe(1_000_000);
    expect(bodyLimit('/api/login')).toBe(64_000);
    expect(bodyLimit('/pro')).toBeNull();
  });

  it('matches the production Caddyfile', () => {
    const caddyfile = readFileSync(new URL('../deploy/Caddyfile', import.meta.url), 'utf8');
    const matcher = (name: string) =>
      new Set((new RegExp(`@${name} path ([^\\n]+)`).exec(caddyfile)?.[1] ?? '').trim().split(/\s+/));
    const caddyPaths = (exact: string[], prefixes: string[]) => new Set([...exact, ...prefixes.map((prefix) => `${prefix}*`)]);

    expect(matcher('backend')).toEqual(caddyPaths(BACKEND_EXACT, BACKEND_PREFIXES));
    expect(matcher('legacy')).toEqual(caddyPaths(LEGACY_EXACT, LEGACY_PREFIXES));
    expect(caddyfile).toContain(`@events path_regexp ${EVENT_STREAM.source.replaceAll('\\/', '/')}`);
    expect(caddyfile).toContain('flush_interval -1');
  });
});

async function listen(handler: Parameters<typeof createServer>[1]): Promise<number> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return (server.address() as AddressInfo).port;
}

function get(port: number, path: string, onChunk?: (chunk: string) => void): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, path, agent: false }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
        onChunk?.(chunk);
      });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body, headers: response.headers }));
    });
    request.on('error', reject);
    request.end();
  });
}

describe('dev proxy', () => {
  it('routes by path, forwards the client address and streams events without buffering', async () => {
    let finishStream = (): void => undefined;
    const webPort = await listen((request, response) => response.end(`web ${request.url} ${request.headers['x-forwarded-host']}`));
    const backendPort = await listen((request, response) => {
      if (request.url === '/api/events') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.write('event: state\ndata: 1\n\n');
        finishStream = () => response.end('event: state\ndata: 2\n\n');
        return;
      }
      response.end(`backend ${request.url} ${request.headers['x-forwarded-for']}`);
    });
    const proxy = createDevProxy({ web: new URL(`http://127.0.0.1:${webPort}`), backend: new URL(`http://127.0.0.1:${backendPort}`) });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    servers.push(proxy);
    const port = (proxy.address() as AddressInfo).port;

    expect((await get(port, '/pro')).body).toBe(`web /pro 127.0.0.1:${port}`);
    expect((await get(port, '/healthz')).body).toBe('backend /healthz 127.0.0.1');

    // The first event arrives while the stream is still open; only then does the backend finish it.
    const stream = await get(port, '/api/events', (chunk) => {
      if (chunk.includes('data: 1')) finishStream();
    });
    expect(stream.headers['content-type']).toBe('text/event-stream');
    expect(stream.body).toBe('event: state\ndata: 1\n\nevent: state\ndata: 2\n\n');
  });

  it('answers 502 while an upstream is down', async () => {
    const proxy = createDevProxy({ web: new URL('http://127.0.0.1:9'), backend: new URL('http://127.0.0.1:9') });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    servers.push(proxy);

    expect((await get((proxy.address() as AddressInfo).port, '/')).status).toBe(502);
  });
});
