import type { ChatMessage, ConnectionError, ConnectionState } from '../protocol';
import { toChatMessage, type RawChatMessage } from './chat';
import { toConnectionError } from './errors';
import { normalizeUsername } from './username';

export type LiveConnectionHandlers = {
  onChat: (raw: RawChatMessage) => void;
  onDisconnected: () => void;
  onStreamEnd: () => void;
  onError: (error: unknown) => void;
};

/** Minimal surface of a TikTok live connection; implemented by the connector adapter. */
export interface LiveConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export type LiveConnectionFactory = (username: string, handlers: LiveConnectionHandlers) => LiveConnection;

export type TikTokLiveServiceListener = {
  onStatus: (state: ConnectionState) => void;
  onChat: (message: ChatMessage) => void;
  onError: (error: ConnectionError) => void;
};

export class TikTokLiveService {
  private connection: LiveConnection | null = null;
  // Bumped whenever the current connection is replaced or dropped, so late
  // events from an old connection are ignored.
  private generation = 0;
  private state: ConnectionState = { status: 'disconnected', username: null };

  constructor(
    private readonly createConnection: LiveConnectionFactory,
    private readonly listener: TikTokLiveServiceListener,
    private readonly now: () => number = Date.now
  ) {}

  getState(): ConnectionState {
    return { ...this.state };
  }

  async connect(input: string): Promise<void> {
    const username = normalizeUsername(input);
    if (!username) {
      this.listener.onError({ code: 'invalid-username', message: `Invalid TikTok username` });
      return;
    }

    await this.disconnect();

    const generation = ++this.generation;
    const isCurrent = (): boolean => generation === this.generation;

    const connection = this.createConnection(username, {
      onChat: (raw) => {
        if (!isCurrent()) return;
        const message = toChatMessage(raw, this.now());
        if (message) {
          this.listener.onChat(message);
        }
      },
      onDisconnected: () => {
        // While connecting, the outcome is reported by the connect() promise instead.
        if (isCurrent() && this.state.status === 'connected') {
          this.dropConnection();
        }
      },
      onStreamEnd: () => {
        if (!isCurrent()) return;
        this.listener.onError({ code: 'stream-ended', message: 'The live stream has ended' });
        void this.disconnect();
      },
      onError: (error) => {
        // Errors while connecting are reported once, via the rejected connect() promise.
        if (isCurrent() && this.state.status === 'connected') {
          this.listener.onError(toConnectionError(error));
        }
      }
    });

    this.connection = connection;
    this.setState({ status: 'connecting', username });

    try {
      await connection.connect();
      if (isCurrent()) {
        this.setState({ status: 'connected', username });
      }
    } catch (error) {
      if (!isCurrent()) return;
      this.dropConnection();
      void connection.disconnect().catch(() => undefined);
      this.listener.onError(toConnectionError(error));
    }
  }

  async disconnect(): Promise<void> {
    const connection = this.connection;
    if (this.state.status !== 'disconnected') {
      this.dropConnection();
    }
    if (connection) {
      await connection.disconnect().catch(() => undefined);
    }
  }

  private dropConnection(): void {
    this.connection = null;
    this.generation++;
    this.setState({ status: 'disconnected', username: this.state.username });
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.listener.onStatus({ ...state });
  }
}
