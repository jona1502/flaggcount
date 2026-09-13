import type { Settings } from './settings';
import type { VoteSnapshot } from './voting';
import type { CounterSnapshot } from './voting';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type ReconnectInfo = {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
};

export type ConnectionState = {
  status: ConnectionStatus;
  username: string | null;
  /** Only present while an automatic reconnect is scheduled. */
  reconnect?: ReconnectInfo;
};

export type AppErrorCode =
  | 'invalid-username'
  | 'user-offline'
  | 'user-not-found'
  | 'rate-limited'
  | 'network'
  | 'stream-ended'
  | 'reconnect-failed'
  | 'invalid-target'
  | 'invalid-overlay-settings'
  | 'sidecar-unavailable'
  | 'unknown';

export type AppError = {
  code: AppErrorCode;
  message: string;
};

/** Sanitized state shared with the UI: no chat content and no viewer identities. */
export type AppState = {
  sidecarRunning: boolean;
  connection: ConnectionState;
  votes: VoteSnapshot;
  /** Versioned multi-counter view; `votes` remains available during the compatibility migration. */
  counters?: CounterSnapshot[];
  /** URL for a streaming browser/link source; `null` while the sidecar is not running. */
  overlayUrl: string | null;
  /** Online overlay mirrored through the FlagCount server, e.g. for TikTok LIVE Studio; `null` while unavailable. */
  publicOverlayUrl: string | null;
  settings: Settings;
};
