import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppError } from '../../../shared/appState';
import { WebController } from './webController';
import { isAuthorizedPassword, startWebServer, type WebServerOptions } from './webServer';

const PASSWORD = 'correct-horse-battery';
const AUTH = `Basic ${Buffer.from(`admin:${PASSWORD}`).toString('base64')}`;
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
    { username: '', target: 100, overlay: { showBackground: true, showProgress: true } },
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

const json = (body: unknown, extra: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { authorization: AUTH, 'content-type': 'application/json', ...extra },
  body: JSON.stringify(body)
});

describe('isAuthorizedPassword', () => {
  it('accepts the password with any user name and rejects everything else', () => {
    expect(isAuthorizedPassword(AUTH, PASSWORD)).toBe(true);
    expect(isAuthorizedPassword(`Basic ${Buffer.from(`:${PASSWORD}`).toString('base64')}`, PASSWORD)).toBe(true);
    expect(isAuthorizedPassword(`Basic ${Buffer.from('admin:wrong').toString('base64')}`, PASSWORD)).toBe(false);
    expect(isAuthorizedPassword(`Bearer ${PASSWORD}`, PASSWORD)).toBe(false);
    expect(isAuthorizedPassword(undefined, PASSWORD)).toBe(false);
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

  it('asks for the password before the dashboard and the API', async () => {
    const { server } = await start();

    for (const path of ['/', '/api/state']) {
      const response = await send(server.port, path);
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toContain('Basic');
    }
  });

  it('serves the dashboard and its assets after login, but no files outside the web root', async () => {
    const { server } = await start();
    const headers = { authorization: AUTH };

    const page = await send(server.port, '/', { headers });
    expect(page.status).toBe(200);
    expect(page.headers['content-security-policy']).toContain("frame-ancestors 'none'");

    const asset = await send(server.port, '/assets/app.js', { headers });
    expect(asset.headers['cache-control']).toContain('private');

    expect((await send(server.port, '/%2e%2e/package.json', { headers })).status).toBe(404);
  });

  it('returns the dashboard state and applies commands', async () => {
    const { server, saved } = await start();

    expect((await send(server.port, '/api/target', json({ target: 25 }))).status).toBe(204);
    expect((await send(server.port, '/api/connect', json({ username: '@Streamer' }))).status).toBe(204);

    const state = JSON.parse((await send(server.port, '/api/state', { headers: { authorization: AUTH } })).body);
    expect(state.votes.target).toBe(25);
    expect(state.settings).toMatchObject({ username: 'streamer', target: 25 });
    expect(saved.at(-1)).toMatchObject({ username: 'streamer', target: 25 });
  });

  it('rejects invalid input with an app error', async () => {
    const { server } = await start();

    const response = await send(server.port, '/api/target', json({ target: 0 }));
    expect(response.status).toBe(400);
    expect((JSON.parse(response.body) as AppError).code).toBe('invalid-target');
  });

  it('blocks commands that are not same-origin JSON', async () => {
    const { server } = await start();

    const form = await send(server.port, '/api/reset', {
      method: 'POST',
      headers: { authorization: AUTH, 'content-type': 'application/x-www-form-urlencoded' },
      body: ''
    });
    expect(form.status).toBe(403);

    const crossSite = await send(server.port, '/api/reset', json({}, { origin: 'https://evil.example' }));
    expect(crossSite.status).toBe(403);
  });

  it('locks out an address after repeated wrong passwords', async () => {
    const { server } = await start({ maxFailedLogins: 2 });
    const wrong = { headers: { authorization: `Basic ${Buffer.from('admin:nope').toString('base64')}` } };

    expect((await send(server.port, '/', wrong)).status).toBe(401);
    expect((await send(server.port, '/', wrong)).status).toBe(401);
    const locked = await send(server.port, '/', { headers: { authorization: AUTH } });
    expect(locked.status).toBe(429);
    expect(locked.headers['retry-after']).toBeDefined();
  });
});
