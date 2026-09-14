import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardAccess, CounterView } from '../../../shared/overlayBoard';
import { DEFAULT_OVERLAY_SETTINGS } from '../../../shared/settings';
import { VotingService } from '../../../shared/voting';
import { startLocalServer } from './localServer';

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const view: CounterView = {
  counterId: 'teams',
  name: 'Team-Wahl',
  mode: 'poll',
  options: [
    { optionId: 'red', label: 'Rot', count: 2, color: '#ff0000' },
    { optionId: 'blue', label: 'Blau', count: 1, color: '#0000ff' }
  ],
  totalCount: 3,
  target: null,
  targetReached: false,
  overlay: DEFAULT_OVERLAY_SETTINGS
};

async function start(getBoard: (scope: string) => BoardAccess) {
  const voting = new VotingService();
  const listeners = new Set<() => void>();
  const server = await startLocalServer({
    token: 't'.repeat(64),
    getState: () => ({}),
    getVotes: () => voting.getSnapshot(),
    subscribeVotes: (listener) => voting.subscribe(listener),
    getBoard,
    subscribeBoard: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
  cleanups.push(() => server.close());
  return { port: server.port, notify: () => listeners.forEach((listener) => listener()), listeners };
}

function get(port: number, path: string): Promise<{ status: number; body: string; headers: IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, path, agent: false }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body, headers: response.headers }));
    });
    request.on('error', reject);
    request.end();
  });
}

describe('board overlay routes', () => {
  it('serves an overlay per counter and the overview with a strict CSP', async () => {
    const { port } = await start((scope) => (scope === 'teams' || scope === 'all' ? { status: 'ok', counters: [view] } : { status: 'not-found' }));

    for (const [path, events] of [
      ['/overlay/counter/teams', '/overlay/counter/teams/events'],
      ['/overlay/all', '/overlay/all/events']
    ] as const) {
      const page = await get(port, path);
      expect(page.status).toBe(200);
      expect(page.headers['content-security-policy']).toContain("default-src 'none'");
      expect(page.body).toContain(`data-events="${events}"`);
      expect(page.body).toContain('Team-Wahl');
    }
    expect((await get(port, '/overlay/board.js')).headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect((await get(port, '/overlay/board.css')).status).toBe(200);
  });

  it('serves custom view routes with their explicit layout', async () => {
    const { port } = await start((scope) => scope === 'v-main'
      ? { status: 'ok', counters: [view], layout: { layout: 'horizontal', gap: 24, horizontalAlign: 'start', verticalAlign: 'end', scale: 80 } }
      : { status: 'not-found' });

    const page = await get(port, '/overlay/view/v-main');
    expect(page.status).toBe(200);
    expect(page.body).toContain('data-events="/overlay/view/v-main/events"');
    expect(page.body).toContain('&quot;layout&quot;:&quot;horizontal&quot;');
  });

  it('explains overlays that need Pro or do not exist', async () => {
    const { port } = await start((scope) => (scope === 'all' ? { status: 'pro-required' } : { status: 'not-found' }));

    const pro = await get(port, '/overlay/all');
    expect(pro.status).toBe(403);
    expect(pro.body).toContain('Dieses Overlay gehört zu FlagCount Pro.');
    expect((await get(port, '/overlay/counter/missing')).status).toBe(404);
    expect((await get(port, '/overlay/counter/..%2Fsecret')).status).toBe(404);
  });

  it('streams board updates until the overlay closes', async () => {
    let count = 2;
    const { port, notify, listeners } = await start(() => ({
      status: 'ok',
      counters: [{ ...view, options: [{ ...view.options[0]!, count }, view.options[1]!], totalCount: count + 1 }]
    }));

    const events = await new Promise<unknown[]>((resolve, reject) => {
      const received: unknown[] = [];
      const request = httpRequest({ host: '127.0.0.1', port, path: '/overlay/counter/teams/events', agent: false }, (response) => {
        let buffer = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          buffer += chunk;
          let index: number;
          while ((index = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            const data = block.split('\n').find((line) => line.startsWith('data: '));
            if (!block.includes('event: board') || !data) continue;
            received.push(JSON.parse(data.slice(6)));
            if (received.length === 1) {
              count = 5;
              notify();
            }
            if (received.length === 2) {
              request.destroy();
              resolve(received);
            }
          }
        });
      });
      request.on('error', (error) => {
        if (received.length < 2) reject(error);
      });
      request.end();
    });

    expect(events.map((event) => (event as { counters: CounterView[] }).counters[0]?.totalCount)).toEqual([3, 6]);
    await vi.waitFor(() => expect(listeners.size).toBe(0));
  });
});
