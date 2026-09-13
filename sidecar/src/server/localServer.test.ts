import { createServer, request as httpRequest, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OVERLAY_SETTINGS, type OverlaySettings } from '../../../shared/settings';
import { VotingService } from '../../../shared/voting';
import {
  createSessionToken,
  isAuthorized,
  startLocalServer,
  type LocalServer,
  type LocalServerOptions
} from './localServer';

const TOKEN = 'a'.repeat(64);
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function start(
  overrides: Partial<LocalServerOptions> = {},
  preferredPort = 0
): Promise<{ server: LocalServer; voting: VotingService }> {
  const voting = new VotingService({ target: 4, createRoundId: () => 'round-1' });
  const server = await startLocalServer(
    {
      token: TOKEN,
      getState: () => ({ ok: true }),
      getVotes: () => voting.getSnapshot(),
      subscribeVotes: (listener) => voting.subscribe(listener),
      ...overrides
    },
    preferredPort
  );
  cleanups.push(() => server.close());
  return { server, voting };
}

async function occupyPort(): Promise<{ port: number; blocker: Server }> {
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  return { port: (blocker.address() as AddressInfo).port, blocker };
}

type RequestOptions = {
  path?: string;
  method?: string;
  host?: string;
  authorization?: string | null;
};

type Response = { status: number; body: string; headers: IncomingHttpHeaders };

function send(
  port: number,
  { path = '/api/state', method = 'GET', host = `127.0.0.1:${port}`, authorization = `Bearer ${TOKEN}` }: RequestOptions = {}
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { host };
    if (authorization) {
      headers['authorization'] = authorization;
    }
    const request = httpRequest({ host: '127.0.0.1', port, path, method, headers, agent: false }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body, headers: response.headers }));
    });
    request.on('error', reject);
    request.end();
  });
}

/** Reads `count` SSE events named `eventName` from the overlay stream, then disconnects. */
function readEvents<T>(
  port: number,
  eventName: string,
  count: number,
  onFirstEvent?: () => void
): Promise<{ events: T[]; headers: IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const events: T[] = [];
    const request = httpRequest(
      { host: '127.0.0.1', port, path: '/overlay/events', headers: { host: `127.0.0.1:${port}` }, agent: false },
      (response) => {
        let buffer = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          buffer += chunk;
          let index: number;
          while ((index = buffer.indexOf('\n\n')) >= 0) {
            const lines = buffer.slice(0, index).split('\n');
            buffer = buffer.slice(index + 2);
            const data = lines.find((line) => line.startsWith('data: '));
            if (!lines.includes(`event: ${eventName}`) || !data) continue;

            events.push(JSON.parse(data.slice('data: '.length)) as T);
            if (events.length === 1) onFirstEvent?.();
            if (events.length === count) {
              request.destroy();
              resolve({ events, headers: response.headers });
            }
          }
        });
      }
    );
    request.on('error', (error) => {
      if (events.length < count) reject(error);
    });
    request.end();
  });
}

describe('startLocalServer', () => {
  it('listens on the loopback interface only', async () => {
    const { server } = await start();

    expect(server.address).toBe('127.0.0.1');
    expect(server.port).toBeGreaterThan(0);
  });

  it('uses the preferred port when it is free', async () => {
    const { port, blocker } = await occupyPort();
    await new Promise<void>((resolve) => blocker.close(() => resolve()));

    const { server } = await start({}, port);

    expect(server.port).toBe(port);
  });

  it('falls back to a free port when the preferred port is taken', async () => {
    const { port, blocker } = await occupyPort();
    cleanups.push(() => new Promise<void>((resolve) => blocker.close(() => resolve())));

    const { server } = await start({}, port);

    expect(server.port).not.toBe(port);
    expect((await send(server.port)).status).toBe(200);
  });

  describe('API', () => {
    it('returns the state for authenticated requests', async () => {
      const { server } = await start();

      const response = await send(server.port);

      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ ok: true });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('accepts localhost as host name', async () => {
      const { server } = await start();

      expect((await send(server.port, { host: `localhost:${server.port}` })).status).toBe(200);
    });

    it.each([null, 'Bearer wrong', `Bearer ${TOKEN}x`, `Basic ${TOKEN}`, TOKEN])(
      'rejects the authorization header %j',
      async (authorization) => {
        const { server } = await start();

        expect((await send(server.port, { authorization })).status).toBe(401);
      }
    );

    it('checks authentication before revealing routes', async () => {
      const { server } = await start();

      expect((await send(server.port, { path: '/unknown', authorization: null })).status).toBe(401);
      expect((await send(server.port, { path: '/unknown' })).status).toBe(404);
    });

    it('only allows GET for the state endpoint', async () => {
      const { server } = await start();

      const response = await send(server.port, { method: 'POST' });

      expect(response.status).toBe(405);
      expect(response.headers['allow']).toBe('GET');
    });
  });

  it.each(['/api/state', '/overlay', '/overlay/events'])(
    'rejects foreign host headers on %s to prevent DNS rebinding',
    async (path) => {
      const { server } = await start();

      expect((await send(server.port, { path, host: `evil.example:${server.port}` })).status).toBe(403);
      expect((await send(server.port, { path, host: 'evil.example' })).status).toBe(403);
    }
  );

  describe('overlay', () => {
    it('serves the overlay page without credentials and with a strict CSP', async () => {
      const { server } = await start();

      const response = await send(server.port, { path: '/overlay', authorization: null });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(response.headers['content-security-policy']).toContain("default-src 'none'");
      expect(response.body).toContain('data-count="0"');
      expect(response.body).toContain('data-target="4"');
      expect(response.body).toContain('data-background="true"');
    });

    it('renders the current overlay settings into the page', async () => {
      const { server } = await start({ getOverlaySettings: () => ({ ...DEFAULT_OVERLAY_SETTINGS, showBackground: false, showProgress: false }) });

      const response = await send(server.port, { path: '/overlay', authorization: null });

      expect(response.body).toContain('data-background="false"');
      expect(response.body).toContain('data-progress="false"');
    });

    it.each([
      ['/overlay/overlay.css', 'text/css; charset=utf-8'],
      ['/overlay/overlay.js', 'text/javascript; charset=utf-8']
    ])('serves %s', async (path, contentType) => {
      const { server } = await start();

      const response = await send(server.port, { path, authorization: null });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe(contentType);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('streams the current votes and every update', async () => {
      const { server, voting } = await start();

      const { events, headers } = await readEvents(server.port, 'votes', 2, () =>
        voting.handleComment('viewer', '🚩')
      );

      expect(headers['content-type']).toBe('text/event-stream; charset=utf-8');
      expect(events).toEqual([
        { count: 0, target: 4, roundId: 'round-1', targetReached: false },
        { count: 1, target: 4, roundId: 'round-1', targetReached: false }
      ]);
    });

    it('streams the overlay settings and their updates', async () => {
      let overlay: OverlaySettings = { ...DEFAULT_OVERLAY_SETTINGS, showBackground: true, showProgress: true };
      const listeners = new Set<(settings: OverlaySettings) => void>();
      const { server } = await start({
        getOverlaySettings: () => overlay,
        subscribeOverlaySettings: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        }
      });

      const { events } = await readEvents<OverlaySettings>(server.port, 'settings', 2, () => {
        overlay = { ...DEFAULT_OVERLAY_SETTINGS, showBackground: false, showProgress: true };
        for (const listener of listeners) listener(overlay);
      });

      expect(events).toEqual([
        { ...DEFAULT_OVERLAY_SETTINGS, showBackground: true, showProgress: true },
        { ...DEFAULT_OVERLAY_SETTINGS, showBackground: false, showProgress: true }
      ]);
      await vi.waitFor(() => expect(listeners.size).toBe(0));
    });

    it('stops pushing updates to closed overlay connections', async () => {
      const voting = new VotingService();
      let subscribers = 0;
      const { server } = await start({
        getVotes: () => voting.getSnapshot(),
        subscribeVotes: (listener) => {
          subscribers++;
          const unsubscribe = voting.subscribe(listener);
          return () => {
            subscribers--;
            unsubscribe();
          };
        }
      });

      await readEvents(server.port, 'votes', 1);

      await vi.waitFor(() => expect(subscribers).toBe(0));
    });

    it('only allows GET on overlay routes', async () => {
      const { server } = await start();

      const response = await send(server.port, { path: '/overlay', method: 'POST', authorization: null });

      expect(response.status).toBe(405);
    });

    it('answers unknown overlay paths with 404', async () => {
      const { server } = await start();

      expect((await send(server.port, { path: '/overlay/secret', authorization: null })).status).toBe(404);
    });
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
