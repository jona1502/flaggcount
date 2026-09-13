import type { Settings } from './settings';
import type { VoteSnapshot } from './voting';

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
  /** URL for the OBS browser source; `null` while the sidecar is not running. */
  overlayUrl: string | null;
  settings: Settings;
};
