import { describe, expect, it, vi } from 'vitest';
import type { LiveChatServiceListener } from '../live/LiveChatService';
import { TwitchLiveService } from './TwitchLiveService';

class FakeSocket extends EventTarget {
  readyState = 1;
  close = vi.fn(() => { this.readyState = 3; });
  message(value: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
}

const auth = {
  getState: () => ({ status: 'signed-in', channelId: 'b1', login: 'caster', displayName: 'Caster' } as const),
  getCredentials: () => ({ accessToken: 'access', refreshToken: 'refresh', expiresAt: '2099-01-01T00:00:00.000Z' })
};

function envelope(type: string, payload: unknown) {
  return { metadata: { message_type: type }, payload };
}

describe('TwitchLiveService', () => {
  it('subscribes after welcome and emits every EventSub message id once', async () => {
    const socket = new FakeSocket();
    const chat = vi.fn();
    const status = vi.fn();
    const request = vi.fn(async (input: string) => input.includes('/streams?')
      ? new Response(JSON.stringify({ data: [{}] }), { status: 200 })
      : new Response('{}', { status: 202 }));
    const listener: LiveChatServiceListener = { onChat: chat, onStatus: status, onError: vi.fn() };
    const service = new TwitchLiveService(listener, {
      clientId: 'client', auth: auth as never, fetch: request as typeof fetch,
      createSocket: () => socket as never, keepaliveGraceMs: 60_000
    });

    await service.connect();
    socket.message(envelope('session_welcome', { session: { id: 'session-1' } }));
    await vi.waitFor(() => expect(service.getState().status).toBe('connected'));
    expect(request).toHaveBeenCalledTimes(3);

    const event = { message_id: 'm1', chatter_user_id: 'u1', chatter_user_login: 'viewer', chatter_user_name: 'Viewer', message: { fragments: [{ text: '🚩' }] } };
    socket.message(envelope('notification', { subscription: { type: 'channel.chat.message' }, event }));
    socket.message(envelope('notification', { subscription: { type: 'channel.chat.message' }, event }));
    expect(chat).toHaveBeenCalledTimes(1);
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({ platform: 'twitch', userId: 'u1', comment: '🚩' }));
    await service.disconnect();
  });

  it('reports an offline channel without opening a socket', async () => {
    const error = vi.fn();
    const service = new TwitchLiveService({ onChat: vi.fn(), onStatus: vi.fn(), onError: error }, {
      clientId: 'client', auth: auth as never,
      fetch: vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch,
      createSocket: vi.fn() as never
    });
    await service.connect();
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: 'user-offline' }));
  });
});
