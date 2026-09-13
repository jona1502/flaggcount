import { describe, expect, it } from 'vitest';
import { createRedFlagCounter, type CounterDefinition } from '../../shared/profiles';
import { DEFAULT_OVERLAY_SETTINGS } from '../../shared/settings';
import { SidecarApp } from './app';
import type { SidecarEvent } from './protocol';
import type { LiveConnectionHandlers } from './tiktok/TikTokLiveService';

const teams: CounterDefinition = {
  id: 'teams',
  name: 'Team-Wahl',
  mode: 'poll',
  target: null,
  options: [
    { id: 'red', label: 'Rot', triggers: [{ kind: 'text', value: 'rot', match: 'word' }], accentColor: '#ff0000' },
    { id: 'blue', label: 'Blau', triggers: [{ kind: 'text', value: 'blau', match: 'word' }], accentColor: '#0000ff' }
  ],
  withdrawalTriggers: [],
  overlay: { ...DEFAULT_OVERLAY_SETTINGS }
};

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
    { counters: [createRedFlagCounter(10)], createRoundId: () => `round-${++rounds}` }
  );

  const chat = (userId: string, comment: string): void => {
    connections.at(-1)?.onChat({ user: { id: userId, displayId: `handle-${userId}` }, content: comment });
  };
  const reply = (userId: string, mentionedNickname: string, comment: string): void => {
    connections.at(-1)?.onChat({
      user: { id: userId, displayId: `handle-${userId}` },
      atUser: { id: 'mentioned', nickname: mentionedNickname },
      content: comment
    });
  };
  const ofType = <T extends SidecarEvent['type']>(type: T) =>
    events.filter((event): event is Extract<SidecarEvent, { type: T }> => event.type === type);

  return { app, events, chat, reply, ofType };
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
    expect(ofType('counters').map((event) => event.counters[0]?.totalCount)).toEqual([1, 2]);
    expect(app.getState().votes.count).toBe(2);
  });

  it('does not count a flag that only belongs to the replied-to name', async () => {
    const { app, reply, ofType } = createApp();
    await app.handleCommand({ type: 'connect', username: 'streamer' });

    reply('1', 'Rudi 🚩', '@Rudi 🚩 Hallo');
    reply('2', 'Rudi 🚩', '@Rudi 🚩 Ich stimme 🚩');

    expect(ofType('votes').map((event) => event.votes.count)).toEqual([1]);
    expect(app.getState().votes.count).toBe(1);
  });

  it('publishes a lower count when a viewer withdraws with a white flag', async () => {
    const { app, chat, ofType } = createApp();
    await app.handleCommand({ type: 'connect', username: 'streamer' });

    chat('1', '🚩');
    chat('2', '🚩');
    chat('1', '🏳️');

    expect(ofType('votes').map((event) => event.votes.count)).toEqual([1, 2, 1]);
    expect(app.getState().votes.count).toBe(1);
  });

  it('never forwards chat content or viewer identities', async () => {
    const { app, chat, events } = createApp();
    await app.handleCommand({ type: 'configureCounters', counters: [createRedFlagCounter(10), teams] });
    await app.handleCommand({ type: 'connect', username: 'streamer' });

    chat('4711', 'geheime Nachricht 🚩 rot');

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

  it('adds manual votes to the same count used by chat and the overlay', async () => {
    const { app, chat, ofType } = createApp();

    await app.handleCommand({ type: 'connect', username: 'streamer' });
    await app.handleCommand({ type: 'addManualVote' });
    chat('1', '🚩');

    expect(ofType('votes').map((event) => event.votes.count)).toEqual([1, 2]);
    expect(app.getVotes().count).toBe(2);
  });

  it('subtracts a vote manually and publishes the corrected count', async () => {
    const { app, ofType } = createApp();

    await app.handleCommand({ type: 'addManualVote' });
    await app.handleCommand({ type: 'addManualVote' });
    await app.handleCommand({ type: 'removeManualVote' });

    expect(ofType('votes').map((event) => event.votes.count)).toEqual([1, 2, 1]);
    expect(app.getVotes().count).toBe(1);
  });

  it('applies a changed target from the counter configuration', async () => {
    const { app, chat, ofType } = createApp();
    await app.handleCommand({ type: 'connect', username: 'streamer' });
    chat('1', '🚩');

    await app.handleCommand({ type: 'configureCounters', counters: [createRedFlagCounter(25)] });

    expect(ofType('votes').map((event) => [event.votes.count, event.votes.target, event.votes.roundId])).toEqual([
      [1, 10, 'round-1'],
      [1, 25, 'round-1']
    ]);
    expect(app.getState().votes.target).toBe(25);
  });

  it('runs parallel counters without repainting the overlay for the others', async () => {
    const { app, chat, ofType } = createApp();
    await app.handleCommand({ type: 'configureCounters', counters: [createRedFlagCounter(10), teams] });
    await app.handleCommand({ type: 'connect', username: 'streamer' });
    const overlayVotes: number[] = [];
    app.subscribeVotes((votes) => overlayVotes.push(votes.count));

    chat('1', 'rot');
    chat('2', 'blau');
    chat('1', 'doch blau');
    chat('3', '🚩');

    expect(overlayVotes).toEqual([1]);
    expect(app.getCounters().map((counter) => counter.options.map((option) => option.count))).toEqual([[1], [0, 2]]);
    expect(ofType('counters').at(-1)?.counters[1]).toMatchObject({ counterId: 'teams', totalCount: 2 });
  });

  it('targets manual votes and resets at one counter', async () => {
    const { app } = createApp();
    await app.handleCommand({ type: 'configureCounters', counters: [createRedFlagCounter(10), teams] });

    await app.handleCommand({ type: 'addManualVote', counterId: 'teams', optionId: 'blue' });
    await app.handleCommand({ type: 'addManualVote' });
    await app.handleCommand({ type: 'removeManualVote', counterId: 'teams', optionId: 'blue' });
    await app.handleCommand({ type: 'addManualVote', counterId: 'teams', optionId: 'red' });
    await app.handleCommand({ type: 'reset', counterId: 'teams' });

    expect(app.getCounters().map((counter) => counter.totalCount)).toEqual([1, 0]);
  });

  it('warns about manual votes for unknown counters', async () => {
    const { app, ofType } = createApp();

    await app.handleCommand({ type: 'addManualVote', counterId: 'missing' });

    expect(ofType('log').map((event) => event.message)).toEqual(['Ignoring a manual vote for an unknown counter or option']);
    expect(app.getVotes().count).toBe(0);
  });

  it('lets the overlay subscribe to vote updates', async () => {
    const { app, chat } = createApp();
    await app.handleCommand({ type: 'connect', username: 'streamer' });
    const received: number[] = [];

    const unsubscribe = app.subscribeVotes((votes) => received.push(votes.count));
    chat('1', '🚩');
    unsubscribe();
    chat('2', '🚩');

    expect(received).toEqual([1]);
    expect(app.getVotes().count).toBe(2);
  });

  it('applies the overlay settings of the first counter and notifies the overlay', async () => {
    const { app } = createApp();
    const received: boolean[] = [];
    const unsubscribe = app.subscribeOverlaySettings((overlay) => received.push(overlay.showBackground));
    const hidden = { ...DEFAULT_OVERLAY_SETTINGS, showBackground: false };

    await app.handleCommand({ type: 'configureCounters', counters: [createRedFlagCounter(10, hidden)] });
    await app.handleCommand({ type: 'configureCounters', counters: [createRedFlagCounter(20, hidden)] });
    unsubscribe();
    await app.handleCommand({ type: 'configureCounters', counters: [createRedFlagCounter(10)] });

    expect(received).toEqual([false]);
    expect(app.getState().overlay).toEqual(DEFAULT_OVERLAY_SETTINGS);
  });

  it('emits the full state on request', async () => {
    const { app, events } = createApp();

    await app.handleCommand({ type: 'getState' });

    expect(events).toEqual([
      { type: 'status', connection: { status: 'disconnected', username: null } },
      { type: 'votes', votes: { count: 0, target: 10, roundId: 'round-1', targetReached: false } },
      {
        type: 'counters',
        counters: [
          {
            counterId: 'red-flags',
            name: 'Rote Flaggen',
            mode: 'single',
            options: [{ optionId: 'red-flag', label: 'Rote Flagge', count: 0 }],
            totalCount: 0,
            target: 10,
            targetReached: false,
            roundId: 'round-1'
          }
        ]
      }
    ]);
  });
});
