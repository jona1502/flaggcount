import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_OVERLAY_SETTINGS } from '../../../shared/settings';
import type { AppError } from '../../../shared/appState';
import { channelIdForKey } from '../relay/relayChannel';
import { RelayChannels } from './relayChannels';
import { isCorrectPassword } from './session';
import { WebController } from './webController';
import { startWebServer, type WebServerOptions } from './webServer';

const PASSWORD = 'correct-horse-battery';
const cleanups: (() => Promise<unknown> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function start(overrides: Partial<WebServerOptions> = {}) {
  const saved: unknown[] = [];
  const controller = new WebController(
    () => ({ connect: async () => undefined, disconnect: async () => undefined }),
    { username: '', target: 100, overlay: { ...DEFAULT_OVERLAY_SETTINGS, showBackground: true, showProgress: true } },
    { save: async (settings) => void saved.push(settings) },
    () => undefined
  );
  await controller.start();

  const webRoot = mkdtempSync(join(tmpdir(), 'flagcount-web-'));
  mkdirSync(join(webRoot, 'assets'));
  writeFileSync(join(webRoot, 'web.html'), '<!doctype html><title>FlagCount</title>');
  writeFileSync(join(webRoot, 'assets', 'app.js'), 'console.log(1)');

  const server = await startWebServer({ backend: controller, password: PASSWORD, webRoot, ...overrides });
  cleanups.push(
    () => rmSync(webRoot, { recursive: true, force: true }),
    () => controller.shutdown(),
    () => server.close()
  );
  return { server, controller, saved };
}

type Response = { status: number; body: string; headers: IncomingHttpHeaders };

function send(
  port: number,
  path: string,
  { method = 'GET', headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, path, method, headers, agent: false }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (text += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text, headers: response.headers }));
    });
    request.on('error', reject);
    request.end(body);
  });
}

const post = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body)
});

type Stream = { status: number; waitFor: (text: string) => Promise<void>; close: () => void };

/** Opens an event stream and lets the test wait for text to arrive on it. */
function openStream(port: number, path: string): Promise<Stream> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, path, agent: false }, (response) => {
      let received = '';
      let waiters: { text: string; done: () => void }[] = [];
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        received += chunk;
        const ready = waiters.filter((waiter) => received.includes(waiter.text));
        waiters = waiters.filter((waiter) => !received.includes(waiter.text));
        for (const waiter of ready) waiter.done();
      });
      resolve({
        status: response.statusCode ?? 0,
        waitFor: (text) =>
          new Promise((done) => {
            if (received.includes(text)) done();
            else waiters.push({ text, done });
          }),
        close: () => request.destroy()
      });
    });
    request.on('error', (error) => {
      if (!request.destroyed) reject(error);
    });
    request.end();
  });
}

const RELAY_KEY = 'a'.repeat(43);
const RELAY_CHANNEL = channelIdForKey(RELAY_KEY);
const RELAY_UPDATE = {
  votes: { count: 7, target: 20, roundId: 'r1', targetReached: false },
  overlay: { ...DEFAULT_OVERLAY_SETTINGS, showBackground: false, showProgress: true }
};

const relayPut = (body: unknown, key = RELAY_KEY) => ({
  method: 'PUT',
  headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

/** Signs in and returns the `name=value` pair of the session cookie. */
async function signIn(port: number): Promise<string> {
  const response = await send(port, '/api/login', post({ password: PASSWORD }));
  expect(response.status).toBe(204);
  return response.headers['set-cookie']?.[0]?.split(';')[0] ?? '';
}

describe('isCorrectPassword', () => {
  it('accepts only the exact password', () => {
    expect(isCorrectPassword(PASSWORD, PASSWORD)).toBe(true);
    expect(isCorrectPassword('wrong', PASSWORD)).toBe(false);
    expect(isCorrectPassword('', PASSWORD)).toBe(false);
    expect(isCorrectPassword(undefined, PASSWORD)).toBe(false);
  });
});

describe('startWebServer', () => {
  it('serves the health check and the overlay without a login', async () => {
    const { server } = await start();

    expect((await send(server.port, '/healthz')).body).toBe('ok');
    const overlay = await send(server.port, '/overlay');
    expect(overlay.status).toBe(200);
    expect(overlay.body).toContain('FlagCount Overlay');
  });

  it('serves the dashboard shell without a session, but not the API', async () => {
    const { server } = await start();

    const page = await send(server.port, '/');
    expect(page.status).toBe(200);
    expect(page.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(JSON.parse((await send(server.port, '/api/session')).body)).toEqual({ authenticated: false });

    for (const path of ['/api/state', '/api/events']) {
      const response = await send(server.port, path);
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBeUndefined();
    }
    expect((await send(server.port, '/api/reset', post({}))).status).toBe(401);
  });

  it('serves the landing page and the dashboard route from the app shell', async () => {
    const { server } = await start();

    for (const path of ['/', '/dashboard', '/dashboard/']) {
      const page = await send(server.port, path);
      expect(page.status).toBe(200);
      expect(page.body).toContain('<title>FlagCount</title>');
    }
  });

  it('redirects downloads to the newest installer without a login', async () => {
    const release = {
      version: '0.2.0',
      downloadUrl: 'https://example.test/FlagCount_0.2.0_x64-setup.exe',
      sizeBytes: 1,
      publishedAt: null,
      pageUrl: 'https://example.test/releases/tag/app-v0.2.0'
    };
    const { server } = await start({ latestRelease: async () => release, releasesUrl: 'https://example.test/releases' });

    const download = await send(server.port, '/download');
    expect(download.status).toBe(302);
    expect(download.headers.location).toBe(release.downloadUrl);
    expect(JSON.parse((await send(server.port, '/api/release')).body)).toEqual({ release });
  });

  it('falls back to the releases page while no release is known', async () => {
    const { server } = await start({ latestRelease: async () => null, releasesUrl: 'https://example.test/releases' });

    const download = await send(server.port, '/download');
    expect(download.status).toBe(302);
    expect(download.headers.location).toBe('https://example.test/releases');
    expect(JSON.parse((await send(server.port, '/api/release')).body)).toEqual({ release: null });
  });

  it('mirrors a desktop app to its public online overlay', async () => {
    const relay = new RelayChannels();
    const { server } = await start({ relay });

    const waiting = await send(server.port, `/o/${RELAY_CHANNEL}`);
    expect(waiting.status).toBe(200);
    expect(waiting.body).toContain('data-count="0"');

    expect((await send(server.port, `/api/relay/${RELAY_CHANNEL}`, relayPut(RELAY_UPDATE))).status).toBe(204);
    expect(relay.get(RELAY_CHANNEL)).toEqual(RELAY_UPDATE);

    const page = await send(server.port, `/o/${RELAY_CHANNEL}`);
    expect(page.body).toContain('data-count="7"');
    expect(page.body).toContain('data-background="false"');
    expect(page.body).toContain(`data-events="/o/${RELAY_CHANNEL}/events"`);
    expect(page.headers['content-security-policy']).toContain("script-src 'self'");
  });

  it('streams relay updates to open overlays', async () => {
    const relay = new RelayChannels();
    const { server } = await start({ relay });
    const stream = await openStream(server.port, `/o/${RELAY_CHANNEL}/events`);
    cleanups.push(() => stream.close());
    expect(stream.status).toBe(200);

    await send(server.port, `/api/relay/${RELAY_CHANNEL}`, relayPut(RELAY_UPDATE));

    await stream.waitFor('"count":7');
    await stream.waitFor('"showBackground":false');
  });

  it('accepts relay updates only with the key of the channel', async () => {
    const relay = new RelayChannels();
    const { server } = await start({ relay });
    const path = `/api/relay/${RELAY_CHANNEL}`;

    expect((await send(server.port, path, relayPut(RELAY_UPDATE, 'b'.repeat(43)))).status).toBe(401);
    expect((await send(server.port, path, { ...relayPut(RELAY_UPDATE), headers: {} })).status).toBe(401);
    expect((await send(server.port, '/api/relay/not-a-channel', relayPut(RELAY_UPDATE))).status).toBe(404);
    expect((await send(server.port, path, { method: 'POST' })).status).toBe(405);
    expect((await send(server.port, path, relayPut({ votes: { count: -1 }, overlay: {} }))).status).toBe(400);
    expect(relay.get(RELAY_CHANNEL)).toBeNull();
  });

  it('serves assets, but no files outside the web root', async () => {
    const { server } = await start();

    const asset = await send(server.port, '/assets/app.js');
    expect(asset.headers['cache-control']).toContain('private');
    expect((await send(server.port, '/%2e%2e/package.json')).status).toBe(404);
  });

  it('signs in with the password and keeps the session in a secure cookie', async () => {
    const { server } = await start();

    expect((await send(server.port, '/api/login', post({ password: 'wrong-password' }))).status).toBe(401);

    const response = await send(server.port, '/api/login', post({ password: PASSWORD }));
    expect(response.status).toBe(204);
    const setCookie = response.headers['set-cookie']?.[0] ?? '';
    expect(setCookie).toMatch(/^flagcount_session=/);
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) {
      expect(setCookie).toContain(attribute);
    }

    const headers = { cookie: setCookie.split(';')[0] ?? '' };
    expect(JSON.parse((await send(server.port, '/api/session', { headers })).body)).toEqual({ authenticated: true });
    expect((await send(server.port, '/api/state', { headers })).status).toBe(200);
  });

  it('rejects tampered and expired sessions', async () => {
    let clock = 1_000_000;
    const { server } = await start({ now: () => clock, sessionMaxAgeMs: 60_000 });
    const cookie = await signIn(server.port);
    const tampered = `${cookie.slice(0, -1)}${cookie.endsWith('A') ? 'B' : 'A'}`;

    expect((await send(server.port, '/api/state', { headers: { cookie: tampered } })).status).toBe(401);
    expect((await send(server.port, '/api/state', { headers: { cookie } })).status).toBe(200);

    clock += 60_001;
    expect((await send(server.port, '/api/state', { headers: { cookie } })).status).toBe(401);
  });

  it('signs out by clearing the session cookie', async () => {
    const { server } = await start();
    const cookie = await signIn(server.port);

    const response = await send(server.port, '/api/logout', post({}, { cookie }));
    expect(response.status).toBe(204);
    expect(response.headers['set-cookie']?.[0]).toContain('Max-Age=0');
  });

  it('returns the dashboard state and applies commands', async () => {
    const { server, saved } = await start();
    const cookie = await signIn(server.port);

    expect((await send(server.port, '/api/target', post({ target: 25 }, { cookie }))).status).toBe(204);
    expect((await send(server.port, '/api/connect', post({ username: '@Streamer' }, { cookie }))).status).toBe(204);
    expect((await send(server.port, '/api/manual-vote', post({}, { cookie }))).status).toBe(204);
    expect((await send(server.port, '/api/manual-vote/remove', post({}, { cookie }))).status).toBe(204);

    const state = JSON.parse((await send(server.port, '/api/state', { headers: { cookie } })).body);
    expect(state.votes.target).toBe(25);
    expect(state.votes.count).toBe(0);
    expect(state.settings).toMatchObject({ username: 'streamer', target: 25 });
    expect(saved.at(-1)).toMatchObject({ username: 'streamer', target: 25 });
  });

  it('rejects invalid input with an app error', async () => {
    const { server } = await start();
    const cookie = await signIn(server.port);

    const response = await send(server.port, '/api/target', post({ target: 0 }, { cookie }));
    expect(response.status).toBe(400);
    expect((JSON.parse(response.body) as AppError).code).toBe('invalid-target');
  });

  it('blocks requests that are not same-origin JSON', async () => {
    const { server } = await start();
    const cookie = await signIn(server.port);

    const form = await send(server.port, '/api/reset', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: ''
    });
    expect(form.status).toBe(403);

    const evil = { origin: 'https://evil.example' };
    expect((await send(server.port, '/api/reset', post({}, { cookie, ...evil }))).status).toBe(403);
    expect((await send(server.port, '/api/login', post({ password: PASSWORD }, evil))).status).toBe(403);
  });

  it('locks out an address after repeated wrong passwords', async () => {
    const { server } = await start({ maxFailedLogins: 2 });
    const wrong = post({ password: 'nope-nope-nope' });

    expect((await send(server.port, '/api/login', wrong)).status).toBe(401);
    const locked = await send(server.port, '/api/login', wrong);
    expect(locked.status).toBe(429);
    expect(locked.headers['retry-after']).toBeDefined();
    expect((await send(server.port, '/api/login', post({ password: PASSWORD }))).status).toBe(429);
  });
});
