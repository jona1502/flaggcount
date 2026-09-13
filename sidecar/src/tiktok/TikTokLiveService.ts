import type { ChatMessage, ConnectionError, ConnectionErrorCode, ConnectionState, LogLevel } from '../protocol';
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
  /** Receives sanitized log messages: never usernames or chat content. */
  onLog?: (level: LogLevel, message: string) => void;
};

export type ReconnectPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Minimum wait after TikTok rate-limited a reconnect attempt. */
  rateLimitDelayMs: number;
};

export const DEFAULT_RECONNECT_POLICY: ReconnectPolicy = {
  maxAttempts: 8,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  rateLimitDelayMs: 30_000
};

export type TikTokLiveServiceOptions = {
  now?: () => number;
  random?: () => number;
  reconnectPolicy?: Partial<ReconnectPolicy>;
};

// Retrying cannot fix these.
const PERMANENT_ERRORS: ReadonlySet<ConnectionErrorCode> = new Set(['invalid-username', 'user-not-found']);

/** Exponential backoff capped at `maxDelayMs`, reduced by up to 20 % jitter. */
export function reconnectDelay(attempt: number, policy: ReconnectPolicy, random: () => number = Math.random): number {
  const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(exponential * (0.8 + 0.2 * random()));
}

export class TikTokLiveService {
  private connection: LiveConnection | null = null;
  // Bumped whenever the current connection is replaced or dropped, so late
  // events from an old connection are ignored.
  private generation = 0;
  private state: ConnectionState = { status: 'disconnected', username: null };
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly policy: ReconnectPolicy;

  constructor(
    private readonly createConnection: LiveConnectionFactory,
    private readonly listener: TikTokLiveServiceListener,
    options: TikTokLiveServiceOptions = {}
  ) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.policy = { ...DEFAULT_RECONNECT_POLICY, ...options.reconnectPolicy };
  }

  getState(): ConnectionState {
    return { ...this.state };
  }

  async connect(input: string): Promise<void> {
    const username = normalizeUsername(input);
    if (!username) {
      this.listener.onError({ code: 'invalid-username', message: 'Invalid TikTok username' });
      return;
    }

    await this.disconnect();
    this.setState({ status: 'connecting', username });
    await this.open(username, 0);
  }

  async disconnect(): Promise<void> {
    this.cancelReconnect();
    const connection = this.connection;
    this.connection = null;
    this.generation++;

    if (this.state.status !== 'disconnected') {
      this.setState({ status: 'disconnected', username: this.state.username });
    }
    if (connection) {
      await connection.disconnect().catch(() => undefined);
    }
  }

  /** Opens a connection; `attempt` is 0 for a manual connect and counts automatic reconnects. */
  private async open(username: string, attempt: number): Promise<void> {
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
        // While (re)connecting, the outcome is reported by the connect() promise instead.
        if (isCurrent() && this.state.status === 'connected') {
          this.handleConnectionLost(username);
        }
      },
      onStreamEnd: () => {
        if (!isCurrent()) return;
        this.log('info', 'Live stream ended');
        this.listener.onError({ code: 'stream-ended', message: 'The live stream has ended' });
        void this.disconnect();
      },
      onError: (error) => {
        // Runtime errors either pass or end in a disconnect, which starts a reconnect.
        if (isCurrent() && this.state.status === 'connected') {
          this.log('warn', `Connection error (${toConnectionError(error).code})`);
        }
      }
    });
    this.connection = connection;

    try {
      await connection.connect();
      if (!isCurrent()) return;
      if (attempt > 0) {
        this.log('info', `Reconnected after ${attempt} ${attempt === 1 ? 'attempt' : 'attempts'}`);
      }
      this.setState({ status: 'connected', username });
    } catch (reason) {
      if (!isCurrent()) return;
      this.connection = null;
      this.generation++;
      void connection.disconnect().catch(() => undefined);
      const error = toConnectionError(reason);

      if (attempt === 0) {
        this.log('warn', `Connecting failed (${error.code})`);
        this.setState({ status: 'disconnected', username });
        this.listener.onError(error);
        return;
      }

      this.log('warn', `Reconnect attempt ${attempt} failed (${error.code})`);
      if (PERMANENT_ERRORS.has(error.code)) {
        this.giveUp(username);
        return;
      }
      this.scheduleReconnect(username, attempt + 1, error.code);
    }
  }

  private handleConnectionLost(username: string): void {
    this.connection = null;
    this.generation++;
    this.log('warn', 'Connection lost unexpectedly');
    this.scheduleReconnect(username, 1);
  }

  private scheduleReconnect(username: string, attempt: number, lastError?: ConnectionErrorCode): void {
    if (attempt > this.policy.maxAttempts) {
      this.giveUp(username);
      return;
    }

    let delayMs = reconnectDelay(attempt, this.policy, this.random);
    if (lastError === 'rate-limited') {
      delayMs = Math.max(delayMs, this.policy.rateLimitDelayMs);
    }

    this.setState({
      status: 'reconnecting',
      username,
      reconnect: { attempt, maxAttempts: this.policy.maxAttempts, delayMs }
    });
    this.log('info', `Reconnect attempt ${attempt} of ${this.policy.maxAttempts} in ${delayMs} ms`);

    const generation = this.generation;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (generation === this.generation) {
        void this.open(username, attempt);
      }
    }, delayMs);
  }

  private giveUp(username: string): void {
    this.setState({ status: 'disconnected', username });
    this.log('error', 'Giving up reconnecting to the live stream');
    this.listener.onError({
      code: 'reconnect-failed',
      message: 'The connection to the live stream could not be restored'
    });
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private log(level: LogLevel, message: string): void {
    this.listener.onLog?.(level, message);
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.listener.onStatus({ ...state });
  }
}
