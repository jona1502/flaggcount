import type { ConnectionState } from '../../../shared/appState';
import type { LiveChatService, LiveChatServiceListener } from '../live/LiveChatService';
import { MessageDedupe } from './dedupe';
import { toTwitchChatMessage } from './message';
import type { TwitchAuthManager } from './TwitchAuthManager';

const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30';
const HELIX = 'https://api.twitch.tv/helix';

type Socket = WebSocket;
type SocketFactory = (url: string) => Socket;
type Fetch = typeof fetch;

export type TwitchLiveServiceOptions = {
  clientId: string;
  auth: TwitchAuthManager;
  fetch?: Fetch;
  createSocket?: SocketFactory;
  now?: () => number;
  keepaliveGraceMs?: number;
};

/** Official Twitch chat source using EventSub WebSockets and the authenticated user's channel. */
export class TwitchLiveService implements LiveChatService {
  private state: ConnectionState = { status: 'disconnected', username: null, platform: 'twitch', channel: null };
  private socket: Socket | null = null;
  private generation = 0;
  private keepalive: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly dedupe = new MessageDedupe();
  private readonly request: Fetch;
  private readonly createSocket: SocketFactory;
  private readonly now: () => number;

  constructor(private readonly listener: LiveChatServiceListener, private readonly options: TwitchLiveServiceOptions) {
    this.request = options.fetch ?? fetch;
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
    this.now = options.now ?? Date.now;
  }

  getState(): ConnectionState { return structuredClone(this.state); }

  async connect(): Promise<void> {
    await this.disconnect();
    const auth = this.options.auth.getState();
    const credentials = this.options.auth.getCredentials();
    if (auth.status !== 'signed-in' || !credentials) {
      this.listener.onError({ code: 'authentication-required', message: 'Sign in with Twitch first' });
      return;
    }
    const live = await this.request(`${HELIX}/streams?user_id=${encodeURIComponent(auth.channelId)}`, {
      headers: this.headers(credentials.accessToken)
    });
    if (!live.ok) return this.failAuthOrNetwork(live.status);
    const body = await live.json() as { data?: unknown[] };
    if (!Array.isArray(body.data) || body.data.length === 0) {
      this.listener.onError({ code: 'user-offline', message: 'The Twitch channel is not live' });
      return;
    }
    this.setState({ status: 'connecting', username: auth.login, platform: 'twitch', channel: {
      platform: 'twitch', channelId: auth.channelId, login: auth.login, displayName: auth.displayName
    }});
    this.open(EVENTSUB_URL, ++this.generation);
  }

  async disconnect(): Promise<void> {
    this.generation++;
    this.clearKeepalive();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'disconnect');
    if (this.state.status !== 'disconnected') this.setState({ ...this.state, status: 'disconnected', reconnect: undefined });
  }

  private open(url: string, generation: number): void {
    const socket = this.createSocket(url);
    this.socket = socket;
    socket.addEventListener('message', (event) => void this.onMessage(generation, String(event.data)));
    socket.addEventListener('close', () => this.onClose(generation));
    socket.addEventListener('error', () => this.listener.onLog?.('warn', 'Twitch EventSub socket error'));
  }

  private async onMessage(generation: number, raw: string): Promise<void> {
    if (generation !== this.generation) return;
    let envelope: any;
    try { envelope = JSON.parse(raw); } catch { return; }
    this.armKeepalive(generation);
    const type = envelope?.metadata?.message_type;
    if (type === 'session_welcome') {
      const sessionId = envelope?.payload?.session?.id;
      if (typeof sessionId !== 'string' || !await this.subscribe(sessionId)) return;
      this.reconnectAttempts = 0;
      this.setState({ ...this.state, status: 'connected', reconnect: undefined });
    } else if (type === 'session_reconnect') {
      const reconnectUrl = envelope?.payload?.session?.reconnect_url;
      if (typeof reconnectUrl === 'string' && reconnectUrl.startsWith('wss://')) {
        const old = this.socket;
        this.open(reconnectUrl, ++this.generation);
        old?.close(1000, 'reconnect');
      }
    } else if (type === 'notification') {
      const subscriptionType = envelope?.payload?.subscription?.type;
      if (subscriptionType === 'channel.chat.message') {
        const message = toTwitchChatMessage(envelope.payload.event ?? {}, this.now());
        if (message && this.dedupe.accept(message.messageId)) this.listener.onChat(message);
      } else if (subscriptionType === 'stream.offline') {
        this.listener.onError({ code: 'stream-ended', message: 'The Twitch stream has ended' });
        await this.disconnect();
      }
    } else if (type === 'revocation') {
      this.listener.onError({ code: 'authorization-revoked', message: 'Twitch authorization was revoked' });
      await this.disconnect();
    }
  }

  private async subscribe(sessionId: string): Promise<boolean> {
    const auth = this.options.auth.getState();
    const credentials = this.options.auth.getCredentials();
    if (auth.status !== 'signed-in' || !credentials) return false;
    for (const type of ['channel.chat.message', 'stream.offline']) {
      const condition = type === 'channel.chat.message'
        ? { broadcaster_user_id: auth.channelId, user_id: auth.channelId }
        : { broadcaster_user_id: auth.channelId };
      const response = await this.request(`${HELIX}/eventsub/subscriptions`, {
        method: 'POST', headers: { ...this.headers(credentials.accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, version: '1', condition, transport: { method: 'websocket', session_id: sessionId } })
      });
      if (!response.ok) { this.failAuthOrNetwork(response.status); return false; }
    }
    return true;
  }

  private headers(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, 'Client-Id': this.options.clientId };
  }

  private failAuthOrNetwork(status: number): void {
    this.listener.onError(status === 401 || status === 403
      ? { code: 'authorization-revoked', message: 'Twitch authorization is no longer valid' }
      : { code: 'network', message: 'Twitch could not be reached' });
    void this.disconnect();
  }

  private onClose(generation: number): void {
    if (generation !== this.generation || this.state.status === 'disconnected') return;
    this.clearKeepalive();
    const attempt = ++this.reconnectAttempts;
    if (attempt > 8) {
      this.listener.onError({ code: 'reconnect-failed', message: 'The Twitch connection could not be restored' });
      void this.disconnect();
      return;
    }
    const delayMs = Math.min(30_000, 1000 * 2 ** (attempt - 1));
    this.setState({ ...this.state, status: 'reconnecting', reconnect: { attempt, maxAttempts: 8, delayMs } });
    const expected = this.generation;
    setTimeout(() => { if (expected === this.generation) this.open(EVENTSUB_URL, expected); }, delayMs);
  }

  private armKeepalive(generation: number): void {
    this.clearKeepalive();
    this.keepalive = setTimeout(() => {
      if (generation === this.generation) this.socket?.close(4000, 'keepalive timeout');
    }, this.options.keepaliveGraceMs ?? 40_000);
  }
  private clearKeepalive(): void { if (this.keepalive) clearTimeout(this.keepalive); this.keepalive = null; }
  private setState(state: ConnectionState): void { this.state = state; this.listener.onStatus(structuredClone(state)); }
}
