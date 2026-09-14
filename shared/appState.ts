import type { LicenseState } from './licensing';
import type { Settings } from './profiles';
import type { CounterSnapshot, VoteSnapshot } from './voting';
import type { RoundRecord } from './history';
import type { LiveChannel, LivePlatform, TwitchAuthState } from './live';

export type ConnectionStatus = 'disconnected' | 'authenticating' | 'connecting' | 'connected' | 'reconnecting';

export type ReconnectInfo = {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
};

export type ConnectionState = {
  status: ConnectionStatus;
  /** Compatibility alias for the current TikTok UI; removed after the platform UI migration. */
  username: string | null;
  platform?: LivePlatform;
  channel?: LiveChannel | null;
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
  | 'authentication-required'
  | 'permission-required'
  | 'authorization-revoked'
  | 'provider-not-configured'
  | 'invalid-target'
  | 'invalid-overlay-settings'
  | 'invalid-code'
  | 'invalid-installation'
  | 'invalid-profile'
  | 'invalid-counters'
  | 'invalid-overlay-view'
  | 'pro-required'
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
  twitchAuth?: TwitchAuthState;
  /** The first counter of the active profile in the single-count format of 0.2. */
  votes: VoteSnapshot;
  /** Aggregated counts of every counter of the active profile. */
  counters: CounterSnapshot[];
  history?: RoundRecord[];
  /** URL for a streaming browser/link source; `null` while the sidecar is not running. */
  overlayUrl: string | null;
  /** Online overlay mirrored through the FlagCount server, e.g. for TikTok LIVE Studio; `null` while unavailable. */
  publicOverlayUrl: string | null;
  /** Online URL per counter id and `all` for the combined Pro overview. */
  counterOverlayUrls?: Record<string, string>;
  settings: Settings;
  /** Plan and license status; never the activation code or secret. */
  license: LicenseState;
};
