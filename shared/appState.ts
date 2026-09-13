import type { LicenseState } from './licensing';
import type { Settings } from './profiles';
import type { CounterSnapshot, VoteSnapshot } from './voting';

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
  | 'invalid-code'
  | 'invalid-installation'
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
  /** The first counter of the active profile in the single-count format of 0.2. */
  votes: VoteSnapshot;
  /** Aggregated counts of every counter of the active profile. */
  counters: CounterSnapshot[];
  /** URL for a streaming browser/link source; `null` while the sidecar is not running. */
  overlayUrl: string | null;
  /** Online overlay mirrored through the FlagCount server, e.g. for TikTok LIVE Studio; `null` while unavailable. */
  publicOverlayUrl: string | null;
  settings: Settings;
  /** Plan and license status; never the activation code or secret. */
  license: LicenseState;
};
