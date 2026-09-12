import { describe, expect, it } from 'vitest';
import { VotingService } from '../../shared/voting';
import { SidecarApp } from './app';
import type { SidecarEvent } from './protocol';
import type { LiveConnectionHandlers } from './tiktok/TikTokLiveService';

function createApp() {
  const events: SidecarEvent[] = [];
  const connections: LiveConnectionHandlers[] = [];
  let rounds = 0;

  const app = new SidecarApp(
    (_username, handlers) => {
      connections.push(handlers);
      return { connect: async () => undefined, disconnect: async () => undefined };
    },
    (event) => events.push(event),
    { votingService: new VotingService({ target: 10, createRoundId: () => `round-${++rounds}` }) }
  );

  const chat = (userId: string, comment: string): void => {
    connections.at(-1)?.onChat({ user: { id: userId, displayId: `handle-${userId}` }, content: comment });
  };
  const ofType = <T extends SidecarEvent['type']>(type: T) =>
    events.filter((event): event is Extract<SidecarEvent, { type: T }> => event.type === type);

  return { app, events, chat, ofType };
}

describe('SidecarApp', () => {
  it('reports connection status changes', async () => {
    const { app, ofType } = createApp();

    await app.handleCommand({ type: 'connect', username: '@Streamer' });

    expect(ofType('status').map((event) => event.connection)).toEqual([
      { status: 'connecting', username: 'streamer' },
      { status: 'connected', username: 'streamer' }
    ]);
  });

  it('counts one vote per user from chat messages', async () => {
    const { app, chat, ofType } = createApp();
    await app.handleCommand({ type: 'connect', username: 'streamer' });

    chat('1', '🚩');
    chat('1', '🚩🚩');
    chat('2', 'Hallo');
    chat('3', 'Bitte 🚩');

    expect(ofType('votes').map((event) => event.votes.count)).toEqual([1, 2]);
    expect(app.getState().votes.count).toBe(2);
  });

  it('never forwards chat content or viewer identities', async () => {
    const { app, chat, events } = createApp();
    await app.handleCommand({ type: 'connect', username: 'streamer' });

    chat('4711', 'geheime Nachricht 🚩');

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('geheime Nachricht');
    expect(serialized).not.toContain('4711');
  });

  it('starts a new round on reset', async () => {
    const { app, chat, ofType } = createApp();
    await app.handleCommand({ type: 'connect', username: 'streamer' });
    chat('1', '🚩');

    await app.handleCommand({ type: 'reset' });
    chat('1', '🚩');

    expect(ofType('votes').map((event) => [event.votes.count, event.votes.roundId])).toEqual([
      [1, 'round-1'],
      [0, 'round-2'],
      [1, 'round-2']
    ]);
  });

  it('changes the target and rejects invalid targets', async () => {
    const { app, ofType } = createApp();

    await app.handleCommand({ type: 'setTarget', target: 25 });
    await app.handleCommand({ type: 'setTarget', target: 0 });
    await app.handleCommand({ type: 'setTarget', target: 2.5 });

    expect(ofType('votes').map((event) => event.votes.target)).toEqual([25]);
    expect(ofType('error').map((event) => event.error.code)).toEqual(['invalid-target', 'invalid-target']);
    expect(app.getState().votes.target).toBe(25);
  });

  it('emits the full state on request', async () => {
    const { app, events } = createApp();

    await app.handleCommand({ type: 'getState' });

    expect(events).toEqual([
      { type: 'status', connection: { status: 'disconnected', username: null } },
      { type: 'votes', votes: { count: 0, target: 10, roundId: 'round-1', targetReached: false } }
    ]);
  });
});
