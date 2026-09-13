import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SidecarEvent } from '../protocol';

let bundleDir: string;
let bundlePath: string;

// Bundle the real entry point the same way the release build does.
beforeAll(async () => {
  bundleDir = mkdtempSync(join(tmpdir(), 'flagcount-sidecar-'));
  bundlePath = join(bundleDir, 'index.cjs');
  await build({
    entryPoints: [fileURLToPath(new URL('../index.ts', import.meta.url))],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    logLevel: 'silent'
  });
}, 60_000);

afterAll(() => {
  rmSync(bundleDir, { recursive: true, force: true });
});

function startSidecarProcess() {
  const child = spawn(process.execPath, [bundlePath], { stdio: ['pipe', 'pipe', 'pipe'] });
  const events: SidecarEvent[] = [];
  const nonProtocolLines: string[] = [];
  let buffer = '';

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    let index: number;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      try {
        events.push(JSON.parse(line) as SidecarEvent);
      } catch {
        nonProtocolLines.push(line);
      }
    }
  });
  child.stderr.resume();

  const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  const send = (line: string): void => {
    child.stdin.write(`${line}\n`);
  };
  const lastOf = <T extends SidecarEvent['type']>(type: T) =>
    events.filter((event): event is Extract<SidecarEvent, { type: T }> => event.type === type).at(-1);

  return { child, events, nonProtocolLines, exited, send, lastOf };
}

function get(port: number, path: string, authorization?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { host: `127.0.0.1:${port}` };
    if (authorization) headers['authorization'] = authorization;
    const request = httpRequest({ host: '127.0.0.1', port, path, headers, agent: false }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
    });
    request.on('error', reject);
    request.end();
  });
}

describe('sidecar process', () => {
  it('talks to its host over the line protocol and stops when stdin closes', async () => {
    const sidecar = startSidecarProcess();
    const waitOptions = { timeout: 10_000, interval: 25 };

    await vi.waitFor(() => expect(sidecar.lastOf('ready')).toBeDefined(), waitOptions);
    const ready = sidecar.lastOf('ready');
    if (!ready) throw new Error('sidecar did not start');
    expect(ready.token).toMatch(/^[0-9a-f]{64}$/);
    await vi.waitFor(() => expect(sidecar.lastOf('votes')).toBeDefined(), waitOptions);
    expect(sidecar.lastOf('status')?.connection).toEqual({ status: 'disconnected', username: null });
    const firstRound = sidecar.lastOf('votes')?.votes.roundId;

    sidecar.send('{"type":"setTarget","target":7}');
    await vi.waitFor(() => expect(sidecar.lastOf('votes')?.votes.target).toBe(7), waitOptions);

    sidecar.send('{"type":"reset"}');
    await vi.waitFor(() => expect(sidecar.lastOf('votes')?.votes.roundId).not.toBe(firstRound), waitOptions);

    sidecar.send('not a command');
    await vi.waitFor(
      () => expect(sidecar.lastOf('log')).toMatchObject({ level: 'warn', message: 'Ignoring invalid command' }),
      waitOptions
    );

    const authorized = await get(ready.port, '/api/state', `Bearer ${ready.token}`);
    expect(authorized.status).toBe(200);
    expect(JSON.parse(authorized.body)).toMatchObject({ votes: { target: 7, count: 0 } });
    expect((await get(ready.port, '/api/state')).status).toBe(401);
    expect((await get(ready.port, '/overlay')).body).toContain('data-target="7"');

    sidecar.child.stdin.end();
    expect(await sidecar.exited).toBe(0);
    expect(sidecar.nonProtocolLines).toEqual([]);
  }, 30_000);
});
