import { describe, expect, it, vi, type Mock } from 'vitest';
import type { ConnectionState } from '../protocol';
import { LiveConnectionError } from './errors';
import { TikTokLiveService, type LiveConnectionHandlers } from './TikTokLiveService';

type FakeConnection = {
  username: string;
  handlers: LiveConnectionHandlers;
  connect: Mock<() => Promise<void>>;
  disconnect: Mock<() => Promise<void>>;
};

function createHarness(connectImpl: () => Promise<void> = async () => undefined) {
  const connections: FakeConnection[] = [];
  const listener = {
    onStatus: vi.fn<(state: ConnectionState) => void>(),
    onChat: vi.fn(),
    onError: vi.fn()
  };
  const service = new TikTokLiveService(
    (username, handlers) => {
      const connection: FakeConnection = {
        username,
        handlers,
        connect: vi.fn(connectImpl),
        disconnect: vi.fn(async () => undefined)
      };
      connections.push(connection);
      return connection;
    },
    listener,
    () => 42
  );
  const statuses = (): string[] => listener.onStatus.mock.calls.map(([state]) => state.status);

  return { service, listener, connections, statuses };
}

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

  it('reports classified errors when connecting fails', async () => {
    const { service, listener, connections, statuses } = createHarness(async () => {
      throw new LiveConnectionError('user-offline', 'User is offline');
    });

    await service.connect('streamer');

    expect(statuses()).toEqual(['connecting', 'disconnected']);
    expect(listener.onError).toHaveBeenCalledWith({ code: 'user-offline', message: 'User is offline' });
    expect(connections[0]?.disconnect).toHaveBeenCalled();
  });

  it('reports a failed connection attempt only once', async () => {
    const error = new LiveConnectionError('user-offline', 'User is offline');
    const harness = createHarness(async () => {
      harness.connections[0]?.handlers.onError(error);
      throw error;
    });

    await harness.service.connect('streamer');

    expect(harness.listener.onError).toHaveBeenCalledTimes(1);
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

  it('marks an unexpectedly closed connection as disconnected', async () => {
    const { service, connections } = createHarness();
    await service.connect('streamer');

    connections[0]?.handlers.onDisconnected();

    expect(service.getState()).toEqual({ status: 'disconnected', username: 'streamer' });
  });

  it('reports the end of the stream and disconnects', async () => {
    const { service, listener, connections } = createHarness();
    await service.connect('streamer');

    connections[0]?.handlers.onStreamEnd();

    expect(listener.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'stream-ended' }));
    expect(service.getState().status).toBe('disconnected');
    expect(connections[0]?.disconnect).toHaveBeenCalled();
  });

  it('forwards runtime errors of the current connection', async () => {
    const { service, listener, connections } = createHarness();
    await service.connect('streamer');

    connections[0]?.handlers.onError(new LiveConnectionError('network', 'Socket closed'));

    expect(listener.onError).toHaveBeenCalledWith({ code: 'network', message: 'Socket closed' });
  });
});
