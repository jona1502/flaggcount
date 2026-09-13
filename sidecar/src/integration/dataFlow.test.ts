import { request as httpRequest } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OverlaySettings } from '../../../shared/settings';
import type { VoteSnapshot } from '../../../shared/voting';
import { SidecarApp } from '../app';
import { parseCommand, serializeEvent, type SidecarEvent } from '../protocol';
import { startLocalServer } from '../server/localServer';
import type { LiveConnectionHandlers } from '../tiktok/TikTokLiveService';

const TOKEN = 't'.repeat(64);
const cleanups: (() => Promise<unknown> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

type StreamEvent = { event: string; data: unknown };

/** Starts the sidecar app with its real local server; only the TikTok connection is faked. */
async function startSidecar() {
  const events: SidecarEvent[] = [];
  const connections: { username: string; handlers: LiveConnectionHandlers }[] = [];

  const app = new SidecarApp(
    (username, handlers) => {
      connections.push({ username, handlers });
      return { connect: async () => undefined, disconnect: async () => undefined };
    },
    // Round-trip through the wire format, exactly like the stdout pipe to Tauri.
    (event) => events.push(JSON.parse(serializeEvent(event)) as SidecarEvent)
  );
  const server = await startLocalServer({
    token: TOKEN,
    getState: () => app.getState(),
    getVotes: () => app.getVotes(),
    subscribeVotes: (listener) => app.subscribeVotes(listener),
    getOverlaySettings: () => app.getOverlaySettings(),
    subscribeOverlaySettings: (listener) => app.subscribeOverlaySettings(listener)
  });
  cleanups.push(
    () => server.close(),
    () => app.shutdown()
  );

  /** Sends a command line as Tauri would write it to stdin. */
  const command = async (line: string): Promise<void> => {
    const parsed = parseCommand(line);
    if (!parsed) throw new Error(`invalid command: ${line}`);
    await app.handleCommand(parsed);
  };
  const chat = (userId: string, comment: string): void => {
    connections.at(-1)?.handlers.onChat({ user: { id: userId, displayId: `viewer${userId}` }, content: comment });
  };
  const tauriVotes = (): VoteSnapshot[] =>
    events.flatMap((event) => (event.type === 'votes' ? [event.votes] : []));
  const statuses = (): string[] =>
    events.flatMap((event) => (event.type === 'status' ? [event.connection.status] : []));

  return { app, server, events, connections, command, chat, tauriVotes, statuses };
}

/**
 * Subscribes to the overlay event stream like the OBS browser source does and
 * resolves once the initial settings and votes have arrived.
 */
async function openOverlayStream(port: number) {
  const received: StreamEvent[] = [];
  let raw = '';
  const request = httpRequest(
    { host: '127.0.0.1', port, path: '/overlay/events', headers: { host: `127.0.0.1:${port}` }, agent: false },
    (response) => {
      let buffer = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        raw += chunk;
        buffer += chunk;
        let index: number;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const lines = buffer.slice(0, index).split('\n');
          buffer = buffer.slice(index + 2);
          const name = lines.find((line) => line.startsWith('event: '))?.slice('event: '.length);
          const data = lines.find((line) => line.startsWith('data: '))?.slice('data: '.length);
          if (name && data) received.push({ event: name, data: JSON.parse(data) });
        }
      });
    }
  );
  request.on('error', () => undefined);
  request.end();
  cleanups.push(() => void request.destroy());

  const stream = {
    raw: () => raw,
    votes: () => received.filter((item) => item.event === 'votes').map((item) => item.data as VoteSnapshot),
    settings: () => received.filter((item) => item.event === 'settings').map((item) => item.data as OverlaySettings)
  };
  await vi.waitFor(() => {
    expect(stream.settings()).toHaveLength(1);
    expect(stream.votes()).toHaveLength(1);
  });
  return stream;
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

describe('sidecar data flow', () => {
  it('pushes every counted flag to Tauri and the overlay immediately', async () => {
    const sidecar = await startSidecar();
    const overlay = await openOverlayStream(sidecar.server.port);

    await sidecar.command('{"type":"connect","username":"streamer"}');
    sidecar.chat('1', '🚩');
    sidecar.chat('1', '🚩🚩');
    sidecar.chat('2', 'Bitte 🚩');
    sidecar.chat('3', 'Hallo');

    await vi.waitFor(() => expect(overlay.votes().map((votes) => votes.count)).toEqual([0, 1, 2]));
    expect(sidecar.tauriVotes().map((votes) => votes.count)).toEqual([1, 2]);
    expect(sidecar.statuses()).toEqual(['connecting', 'connected']);
  });

  it('starts a new round for dashboard and overlay on reset', async () => {
    const sidecar = await startSidecar();
    const overlay = await openOverlayStream(sidecar.server.port);
    await sidecar.command('{"type":"connect","username":"streamer"}');
    sidecar.chat('1', '🚩');

    await sidecar.command('{"type":"reset"}');
    sidecar.chat('1', '🚩');

    await vi.waitFor(() => expect(overlay.votes().map((votes) => votes.count)).toEqual([0, 1, 0, 1]));
    const [initial, , afterReset] = overlay.votes();
    expect(afterReset?.roundId).not.toBe(initial?.roundId);
    expect(sidecar.tauriVotes().at(-1)).toEqual(overlay.votes().at(-1));
  });

  it('applies target changes to the overlay page and stream', async () => {
    const sidecar = await startSidecar();
    const overlay = await openOverlayStream(sidecar.server.port);
    await sidecar.command('{"type":"connect","username":"streamer"}');

    await sidecar.command('{"type":"setTarget","target":3}');
    ['1', '2', '3'].forEach((userId) => sidecar.chat(userId, '🚩'));

    const page = await get(sidecar.server.port, '/overlay');
    expect(page.body).toContain('data-target="3"');
    await vi.waitFor(() =>
      expect(overlay.votes().at(-1)).toMatchObject({ count: 3, target: 3, targetReached: true })
    );
    expect(sidecar.tauriVotes().at(-1)).toMatchObject({ count: 3, targetReached: true });
  });

  it('sends overlay settings changes to the running overlay', async () => {
    const sidecar = await startSidecar();
    const overlay = await openOverlayStream(sidecar.server.port);

    await sidecar.command('{"type":"setOverlaySettings","overlay":{"showBackground":false,"showProgress":false}}');

    await vi.waitFor(() =>
      expect(overlay.settings()).toEqual([
        { showBackground: true, showProgress: true },
        { showBackground: false, showProgress: false }
      ])
    );
  });

  it('keeps the round and the overlay running through an automatic reconnect', async () => {
    const sidecar = await startSidecar();
    const overlay = await openOverlayStream(sidecar.server.port);
    await sidecar.command('{"type":"connect","username":"streamer"}');
    sidecar.chat('1', '🚩');

    sidecar.connections[0]?.handlers.onDisconnected();
    expect(sidecar.statuses().at(-1)).toBe('reconnecting');

    await vi.waitFor(() => expect(sidecar.statuses().at(-1)).toBe('connected'), { timeout: 3000 });
    expect(sidecar.connections).toHaveLength(2);
    sidecar.chat('1', '🚩');
    sidecar.chat('2', '🚩');

    await vi.waitFor(() => expect(overlay.votes().at(-1)?.count).toBe(2));
    expect(overlay.votes().map((votes) => votes.count)).toEqual([0, 1, 2]);
    expect(sidecar.events.some((event) => event.type === 'error')).toBe(false);
  });

  it('never exposes chat content or viewer ids to Tauri, the API or the overlay', async () => {
    const sidecar = await startSidecar();
    const overlay = await openOverlayStream(sidecar.server.port);
    await sidecar.command('{"type":"connect","username":"streamer"}');

    sidecar.chat('4711', 'geheime Nachricht 🚩');
    await vi.waitFor(() => expect(overlay.votes().at(-1)?.count).toBe(1));

    const api = await get(sidecar.server.port, '/api/state', `Bearer ${TOKEN}`);
    const page = await get(sidecar.server.port, '/overlay');
    for (const output of [JSON.stringify(sidecar.events), api.body, page.body, overlay.raw()]) {
      expect(output).not.toContain('geheime Nachricht');
      expect(output).not.toContain('4711');
      expect(output).not.toContain('viewer4711');
    }
  });
});
