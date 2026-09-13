import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ConnectionError, ConnectionState, LogLevel } from '../protocol';
import { LiveConnectionError } from './errors';
import {
  DEFAULT_RECONNECT_POLICY,
  TikTokLiveService,
  reconnectDelay,
  type LiveConnectionHandlers,
  type ReconnectPolicy
} from './TikTokLiveService';

type FakeConnection = {
  username: string;
  handlers: LiveConnectionHandlers;
  connect: Mock<() => Promise<void>>;
  disconnect: Mock<() => Promise<void>>;
};

const TEST_POLICY: ReconnectPolicy = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 5000, rateLimitDelayMs: 10_000 };

type HarnessOptions = {
  /** Result of `connect()` for the n-th created connection (0 = the manual connect). */
  connect?: (index: number) => Promise<void>;
};

function createHarness({ connect = async () => undefined }: HarnessOptions = {}) {
  const connections: FakeConnection[] = [];
  const logs: string[] = [];
  const listener = {
    onStatus: vi.fn<(state: ConnectionState) => void>(),
    onChat: vi.fn(),
    onError: vi.fn<(error: ConnectionError) => void>(),
    onLog: vi.fn((_level: LogLevel, message: string) => {
      logs.push(message);
    })
  };
  const service = new TikTokLiveService(
    (username, handlers) => {
      const index = connections.length;
      const connection: FakeConnection = {
        username,
        handlers,
        connect: vi.fn(() => connect(index)),
        disconnect: vi.fn(async () => undefined)
      };
      connections.push(connection);
      return connection;
    },
    listener,
    { now: () => 42, random: () => 1, reconnectPolicy: TEST_POLICY }
  );

  return {
    service,
    listener,
    connections,
    logs,
    statuses: (): string[] => listener.onStatus.mock.calls.map(([state]) => state.status),
    errorCodes: (): string[] => listener.onError.mock.calls.map(([error]) => error.code),
    reconnectDelays: (): number[] =>
      listener.onStatus.mock.calls.flatMap(([state]) => (state.reconnect ? [state.reconnect.delayMs] : []))
  };
}

const failWith = (code: ConnectionError['code']) => new LiveConnectionError(code, `failed: ${code}`);

afterEach(() => {
  vi.useRealTimers();
});

describe('TikTokLiveService', () => {
  it('connects with the normalized username', async () => {
    const { service, connections, statuses } = createHarness();

    await service.connect(' @Streamer ');

    expect(connections).toHaveLength(1);
    expect(connections[0]?.username).toBe('streamer');
    expect(statuses()).toEqual(['connecting', 'connected']);
    expect(service.getState()).toEqual({ status: 'connected', username: 'streamer' });
  });

  it('rejects invalid usernames without opening a connection', async () => {
    const { service, listener, connections } = createHarness();

    await service.connect('no spaces allowed');

    expect(connections).toHaveLength(0);
    expect(listener.onStatus).not.toHaveBeenCalled();
    expect(listener.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid-username' }));
  });

  it('forwards chat messages in the internal format', async () => {
    const { service, listener, connections } = createHarness();
    await service.connect('streamer');

    connections[0]?.handlers.onChat({ user: { id: '1', displayId: 'viewer' }, content: '🚩' });
    connections[0]?.handlers.onChat({ user: undefined, content: '🚩' });

    expect(listener.onChat).toHaveBeenCalledTimes(1);
    expect(listener.onChat).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '1', uniqueId: 'viewer', comment: '🚩', receivedAt: 42 })
    );
  });

  it('does not forward flags that only occur inside a reply mention', async () => {
    const { service, listener, connections } = createHarness();
    await service.connect('streamer');

    connections[0]?.handlers.onChat({
      user: { id: '1', displayId: 'viewer' },
      atUser: { id: '2', nickname: 'Rudi 🚩' },
      content: '@Rudi 🚩 Hallo'
    });

    expect(listener.onChat).toHaveBeenCalledWith(expect.objectContaining({ comment: ' Hallo' }));
  });

  it('reports classified errors when connecting fails', async () => {
    const { service, listener, connections, statuses } = createHarness({
      connect: async () => {
        throw failWith('user-offline');
      }
    });

    await service.connect('streamer');

    expect(statuses()).toEqual(['connecting', 'disconnected']);
    expect(listener.onError).toHaveBeenCalledWith({ code: 'user-offline', message: 'failed: user-offline' });
    expect(connections[0]?.disconnect).toHaveBeenCalled();
  });

  it('reports a failed connection attempt only once', async () => {
    const harness = createHarness({
      connect: async (index) => {
        harness.connections[index]?.handlers.onError(failWith('user-offline'));
        throw failWith('user-offline');
      }
    });

    await harness.service.connect('streamer');

    expect(harness.listener.onError).toHaveBeenCalledTimes(1);
  });

  it('does not retry a failed manual connection', async () => {
    vi.useFakeTimers();
    const { service, connections } = createHarness({
      connect: async () => {
        throw failWith('network');
      }
    });

    await service.connect('streamer');
    await vi.advanceTimersByTimeAsync(60_000);

    expect(connections).toHaveLength(1);
    expect(service.getState().status).toBe('disconnected');
  });

  it('disconnects and ignores late events from the closed connection', async () => {
    const { service, listener, connections } = createHarness();
    await service.connect('streamer');

    await service.disconnect();
    connections[0]?.handlers.onChat({ user: { id: '1' }, content: '🚩' });

    expect(connections[0]?.disconnect).toHaveBeenCalledTimes(1);
    expect(service.getState().status).toBe('disconnected');
    expect(listener.onChat).not.toHaveBeenCalled();
  });

  it('closes the previous connection when switching streams', async () => {
    const { service, listener, connections } = createHarness();
    await service.connect('first');

    await service.connect('second');
    connections[0]?.handlers.onChat({ user: { id: '1' }, content: '🚩' });

    expect(connections[0]?.disconnect).toHaveBeenCalled();
    expect(service.getState()).toEqual({ status: 'connected', username: 'second' });
    expect(listener.onChat).not.toHaveBeenCalled();
  });

  it('reports the end of the stream and does not reconnect', async () => {
    vi.useFakeTimers();
    const { service, connections, errorCodes } = createHarness();
    await service.connect('streamer');

    connections[0]?.handlers.onStreamEnd();
    connections[0]?.handlers.onDisconnected();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(errorCodes()).toEqual(['stream-ended']);
    expect(service.getState().status).toBe('disconnected');
    expect(connections[0]?.disconnect).toHaveBeenCalled();
    expect(connections).toHaveLength(1);
  });

  it('logs runtime errors without interrupting the stream', async () => {
    const { service, listener, connections, logs } = createHarness();
    await service.connect('streamer');

    connections[0]?.handlers.onError(failWith('network'));

    expect(listener.onError).not.toHaveBeenCalled();
    expect(service.getState().status).toBe('connected');
    expect(logs).toContain('Connection error (network)');
  });

  describe('automatic reconnect', () => {
    it('reconnects with backoff after an unexpected disconnect', async () => {
      vi.useFakeTimers();
      const { service, listener, connections } = createHarness();
      await service.connect('streamer');

      connections[0]?.handlers.onDisconnected();

      expect(service.getState()).toEqual({
        status: 'reconnecting',
        username: 'streamer',
        reconnect: { attempt: 1, maxAttempts: 3, delayMs: 1000 }
      });

      await vi.advanceTimersByTimeAsync(999);
      expect(connections).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(connections).toHaveLength(2);
      expect(connections[1]?.username).toBe('streamer');
      expect(service.getState()).toEqual({ status: 'connected', username: 'streamer' });
      expect(listener.onError).not.toHaveBeenCalled();
    });

    it('forwards chat from the new connection only', async () => {
      vi.useFakeTimers();
      const { service, listener, connections } = createHarness();
      await service.connect('streamer');
      connections[0]?.handlers.onDisconnected();
      await vi.advanceTimersByTimeAsync(1000);

      connections[0]?.handlers.onChat({ user: { id: 'old' }, content: '🚩' });
      connections[1]?.handlers.onChat({ user: { id: 'new' }, content: '🚩' });

      expect(listener.onChat).toHaveBeenCalledTimes(1);
      expect(listener.onChat).toHaveBeenCalledWith(expect.objectContaining({ userId: 'new' }));
    });

    it('retries with growing delays and gives up after the maximum attempts', async () => {
      vi.useFakeTimers();
      const { service, connections, errorCodes, reconnectDelays } = createHarness({
        connect: async (index) => {
          if (index > 0) throw failWith('network');
        }
      });
      await service.connect('streamer');

      connections[0]?.handlers.onDisconnected();
      await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);

      expect(reconnectDelays()).toEqual([1000, 2000, 4000]);
      expect(connections).toHaveLength(4);
      expect(service.getState()).toEqual({ status: 'disconnected', username: 'streamer' });
      expect(errorCodes()).toEqual(['reconnect-failed']);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(connections).toHaveLength(4);
    });

    it('stops retrying when the error is permanent', async () => {
      vi.useFakeTimers();
      const { service, connections, errorCodes } = createHarness({
        connect: async (index) => {
          if (index > 0) throw failWith('user-not-found');
        }
      });
      await service.connect('streamer');

      connections[0]?.handlers.onDisconnected();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(connections).toHaveLength(2);
      expect(errorCodes()).toEqual(['reconnect-failed']);
      expect(service.getState().status).toBe('disconnected');
    });

    it('waits longer when TikTok rate-limits a reconnect attempt', async () => {
      vi.useFakeTimers();
      const { service, connections, reconnectDelays } = createHarness({
        connect: async (index) => {
          if (index === 1) throw failWith('rate-limited');
        }
      });
      await service.connect('streamer');
      connections[0]?.handlers.onDisconnected();
      await vi.advanceTimersByTimeAsync(1000);

      expect(reconnectDelays()).toEqual([1000, 10_000]);
      await vi.advanceTimersByTimeAsync(9_999);
      expect(connections).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(1);
      expect(connections).toHaveLength(3);
      expect(service.getState().status).toBe('connected');
    });

    it('cancels a pending reconnect on manual disconnect', async () => {
      vi.useFakeTimers();
      const { service, listener, connections } = createHarness();
      await service.connect('streamer');
      connections[0]?.handlers.onDisconnected();

      await service.disconnect();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(connections).toHaveLength(1);
      expect(service.getState()).toEqual({ status: 'disconnected', username: 'streamer' });
      expect(listener.onError).not.toHaveBeenCalled();
    });

    it('cancels a pending reconnect when connecting to another stream', async () => {
      vi.useFakeTimers();
      const { service, connections } = createHarness();
      await service.connect('first');
      connections[0]?.handlers.onDisconnected();

      await service.connect('second');
      await vi.advanceTimersByTimeAsync(60_000);

      expect(connections.map((connection) => connection.username)).toEqual(['first', 'second']);
      expect(service.getState()).toEqual({ status: 'connected', username: 'second' });
    });

    it('never writes the username into log messages', async () => {
      vi.useFakeTimers();
      const { service, connections, logs } = createHarness({
        connect: async (index) => {
          if (index > 0) throw failWith('network');
        }
      });
      await service.connect('secretstreamer');

      connections[0]?.handlers.onError(failWith('network'));
      connections[0]?.handlers.onDisconnected();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(logs.length).toBeGreaterThan(3);
      expect(logs.filter((message) => message.includes('secretstreamer'))).toEqual([]);
    });
  });
});

describe('reconnectDelay', () => {
  it.each([
    [1, 1_000],
    [2, 2_000],
    [3, 4_000],
    [4, 8_000],
    [5, 16_000],
    [6, 30_000],
    [20, 30_000]
  ])('waits %i attempt(s) → %i ms at most', (attempt, expected) => {
    expect(reconnectDelay(attempt, DEFAULT_RECONNECT_POLICY, () => 1)).toBe(expected);
  });

  it('applies up to 20 % jitter', () => {
    expect(reconnectDelay(1, DEFAULT_RECONNECT_POLICY, () => 0)).toBe(800);
  });

  it('limits the number of attempts by default', () => {
    expect(DEFAULT_RECONNECT_POLICY.maxAttempts).toBe(8);
  });
});
