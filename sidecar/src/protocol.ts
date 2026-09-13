import type { AppError, AppErrorCode, ConnectionState } from '../../shared/appState';
import type { VoteSnapshot } from '../../shared/voting';

export type { ConnectionState, ConnectionStatus } from '../../shared/appState';
export type ConnectionErrorCode = AppErrorCode;
export type ConnectionError = AppError;

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

/** Commands sent by Tauri to the sidecar, one JSON object per stdin line. */
export type SidecarCommand =
  | { type: 'connect'; username: string }
  | { type: 'disconnect' }
  | { type: 'reset' }
  | { type: 'setTarget'; target: number }
  | { type: 'getState' };

export type LogLevel = 'info' | 'warn' | 'error';

/** Events sent by the sidecar to Tauri, one JSON object per stdout line. */
export type SidecarEvent =
  | { type: 'ready'; port: number; token: string }
  | { type: 'status'; connection: ConnectionState }
  | { type: 'votes'; votes: VoteSnapshot }
  | { type: 'error'; error: AppError }
  /** Sanitized log line: never usernames, chat content, URLs or tokens. */
  | { type: 'log'; level: LogLevel; message: string };

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
    case 'setTarget':
      return typeof record['target'] === 'number' ? { type: 'setTarget', target: record['target'] } : null;
    case 'disconnect':
    case 'reset':
    case 'getState':
      return { type: record['type'] };
    default:
      return null;
  }
}

export function serializeEvent(event: SidecarEvent): string {
  return `${JSON.stringify(event)}\n`;
}
