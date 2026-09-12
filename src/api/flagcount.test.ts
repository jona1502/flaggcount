import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../../shared/appState';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

const { invoke } = await import('@tauri-apps/api/core');
const { listen } = await import('@tauri-apps/api/event');
const { APP_ERROR_EVENT, STATE_CHANGED_EVENT, flagcountApi, toAppError } = await import('./flagcount');

const state: AppState = {
  sidecarRunning: true,
  connection: { status: 'connected', username: 'streamer' },
  votes: { count: 2, target: 10, roundId: 'r1', targetReached: false }
};

describe('flagcountApi', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
    vi.mocked(listen).mockReset();
  });

  it('invokes the typed backend commands', async () => {
    await flagcountApi.getState();
    await flagcountApi.connect('streamer');
    await flagcountApi.disconnect();
    await flagcountApi.resetVotes();
    await flagcountApi.setTarget(25);

    expect(vi.mocked(invoke).mock.calls).toEqual([
      ['get_state'],
      ['connect', { username: 'streamer' }],
      ['disconnect'],
      ['reset_votes'],
      ['set_target', { target: 25 }]
    ]);
  });

  it.each([
    ['onStateChanged', STATE_CHANGED_EVENT, state],
    ['onError', APP_ERROR_EVENT, { code: 'user-offline', message: 'offline' }]
  ] as const)('%s unwraps the event payload', async (method, eventName, payload) => {
    const unlisten = vi.fn();
    let emit: ((event: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      emit = handler as typeof emit;
      return unlisten;
    });
    const handler = vi.fn();

    const result = await flagcountApi[method](handler);
    emit?.({ payload });

    expect(listen).toHaveBeenCalledWith(eventName, expect.any(Function));
    expect(handler).toHaveBeenCalledWith(payload);
    expect(result).toBe(unlisten);
  });
});

describe('toAppError', () => {
  it('keeps structured backend errors', () => {
    expect(toAppError({ code: 'invalid-target', message: 'bad' })).toEqual({ code: 'invalid-target', message: 'bad' });
  });

  it.each([
    [new Error('boom'), 'boom'],
    ['invalid args', 'invalid args'],
    [42, 'Unknown error']
  ])('wraps %o as unknown error', (error, message) => {
    expect(toAppError(error)).toEqual({ code: 'unknown', message });
  });
});
