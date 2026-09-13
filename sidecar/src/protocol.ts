import type { AppError, AppErrorCode, ConnectionState } from '../../shared/appState';
import { parseCounterDefinitions, type CounterDefinition } from '../../shared/profiles';
import { parseOverlaySettings } from '../../shared/settings';
import type { CounterSnapshot, VoteSnapshot } from '../../shared/voting';

export type { ConnectionState, ConnectionStatus } from '../../shared/appState';
export type ConnectionErrorCode = AppErrorCode;
export type ConnectionError = AppError;

/** Bumped whenever commands or events change incompatibly; the sidecar reports it on `ready`. */
export const PROTOCOL_VERSION = 2;

/**
 * Stable, library-independent representation of a TikTok chat comment.
 * Internal to the sidecar: chat content is never sent to Tauri or the UI.
 */
export type ChatMessage = {
  messageId: string;
  /** Stable TikTok user id; falls back to `unique:<handle>` if TikTok omits it. */
  userId: string;
  uniqueId: string;
  nickname: string;
  comment: string;
  receivedAt: number;
};

/** Without a counter id, manual votes go to the first counter; single counters need no option id. */
export type VoteTarget = {
  counterId?: string;
  optionId?: string;
};

/** Commands sent by Tauri to the sidecar, one JSON object per stdin line. */
export type SidecarCommand =
  | { type: 'connect'; username: string }
  | { type: 'disconnect' }
  | ({ type: 'addManualVote' } & VoteTarget)
  | ({ type: 'removeManualVote' } & VoteTarget)
  /** Without a counter id, every counter starts a new round. */
  | { type: 'reset'; counterId?: string }
  /** The counters of the active profile; running rounds of counters that keep their id continue. */
  | { type: 'configureCounters'; counters: CounterDefinition[] }
  | { type: 'getState' };

export type LogLevel = 'info' | 'warn' | 'error';

/** Events sent by the sidecar to Tauri, one JSON object per stdout line. */
export type SidecarEvent =
  /** `publicOverlayUrl` is the online overlay mirrored by the relay; `null` if it is unavailable. */
  | { type: 'ready'; protocolVersion: number; port: number; token: string; publicOverlayUrl: string | null }
  | { type: 'status'; connection: ConnectionState }
  /** The first counter in the single-count format of 0.2, used by the overlay and the relay. */
  | { type: 'votes'; votes: VoteSnapshot }
  /** Aggregated counts of every counter: never viewer identities or chat content. */
  | { type: 'counters'; counters: CounterSnapshot[] }
  | { type: 'error'; error: AppError }
  /** Sanitized log line: never usernames, chat content, URLs or tokens. */
  | { type: 'log'; level: LogLevel; message: string };

export { parseOverlaySettings };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function parseIds<Key extends string>(record: Record<string, unknown>, keys: readonly Key[]): Partial<Record<Key, string>> | null {
  const ids: Partial<Record<Key, string>> = {};
  for (const key of keys) {
    const value = record[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) return null;
    ids[key] = value;
  }
  return ids;
}

export function parseCommand(line: string): SidecarCommand | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  switch (record['type']) {
    case 'connect':
      return typeof record['username'] === 'string' ? { type: 'connect', username: record['username'] } : null;
    case 'configureCounters': {
      const counters = parseCounterDefinitions(record['counters']);
      return counters ? { type: 'configureCounters', counters } : null;
    }
    case 'addManualVote':
    case 'removeManualVote': {
      const target = parseIds(record, ['counterId', 'optionId'] as const);
      return target ? { type: record['type'], ...target } : null;
    }
    case 'reset': {
      const target = parseIds(record, ['counterId'] as const);
      return target ? { type: 'reset', ...target } : null;
    }
    case 'disconnect':
    case 'getState':
      return { type: record['type'] };
    default:
      return null;
  }
}

export function serializeEvent(event: SidecarEvent): string {
  return `${JSON.stringify(event)}\n`;
}
