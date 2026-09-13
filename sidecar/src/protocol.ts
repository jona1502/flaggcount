import type { AppError, AppErrorCode, ConnectionState } from '../../shared/appState';
import type { LicenseState, SignedEntitlement } from '../../shared/licensing';
import { parseCounterDefinitions, type CounterDefinition } from '../../shared/profiles';
import { parseOverlaySettings } from '../../shared/settings';
import type { CounterSnapshot, VoteSnapshot } from '../../shared/voting';
import type { LicenseCredentials } from './license/licenseManager';

export type { ConnectionState, ConnectionStatus } from '../../shared/appState';
export type ConnectionErrorCode = AppErrorCode;
export type ConnectionError = AppError;

/** Bumped whenever commands or events change incompatibly; the sidecar reports it on `ready`. */
export const PROTOCOL_VERSION = 4;

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
  /** The stored license, sent once after every start. The secret only travels over this private pipe. */
  | { type: 'configureLicense'; installationId: string; credentials: LicenseCredentials | null; entitlement: unknown }
  | { type: 'activateLicense'; code: string; replaceInstallationId?: string }
  | { type: 'refreshLicense' }
  | { type: 'deactivateLicense' }
  | { type: 'openCustomerPortal' }
  | { type: 'setTelemetryEnabled'; enabled: boolean }
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
  /** License status for the UI: never the code or the secret. */
  | { type: 'license'; license: LicenseState }
  /** Public Pro overlay URL per counter id and `all`; empty whenever Pro or the relay is unavailable. */
  | { type: 'overlayUrls'; urls: Record<string, string> }
  /** For Tauri to store: the secret goes to the Windows Credential Manager. `null` removes it. */
  | { type: 'licenseCredentials'; credentials: LicenseCredentials | null; entitlement: SignedEntitlement | null }
  /** A page Tauri opens in the browser after checking that it belongs to FlagCount or Paddle. */
  | { type: 'openUrl'; url: string }
  | { type: 'error'; error: AppError }
  /** Sanitized log line: never usernames, chat content, URLs or tokens. */
  | { type: 'log'; level: LogLevel; message: string };

export { parseOverlaySettings };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_CODE_LENGTH = 64;
const MAX_SECRET_LENGTH = 128;

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

function parseCredentials(value: unknown): LicenseCredentials | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { licenseId, secret } = value as Record<string, unknown>;
  return typeof licenseId === 'string' &&
    ID_PATTERN.test(licenseId) &&
    typeof secret === 'string' &&
    secret.length > 0 &&
    secret.length <= MAX_SECRET_LENGTH
    ? { licenseId, secret }
    : undefined;
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
    case 'configureLicense': {
      const installationId = record['installationId'];
      const credentials = parseCredentials(record['credentials']);
      if (typeof installationId !== 'string' || !INSTALLATION_ID_PATTERN.test(installationId) || credentials === undefined) {
        return null;
      }
      return { type: 'configureLicense', installationId, credentials, entitlement: record['entitlement'] ?? null };
    }
    case 'activateLicense': {
      const { code, replaceInstallationId } = record;
      if (typeof code !== 'string' || code.trim() === '' || code.length > MAX_CODE_LENGTH) return null;
      if (replaceInstallationId === undefined || replaceInstallationId === null) return { type: 'activateLicense', code };
      return typeof replaceInstallationId === 'string' && INSTALLATION_ID_PATTERN.test(replaceInstallationId)
        ? { type: 'activateLicense', code, replaceInstallationId }
        : null;
    }
    case 'setTelemetryEnabled':
      return typeof record['enabled'] === 'boolean' ? { type: 'setTelemetryEnabled', enabled: record['enabled'] } : null;
    case 'disconnect':
    case 'refreshLicense':
    case 'deactivateLicense':
    case 'openCustomerPortal':
    case 'getState':
      return { type: record['type'] };
    default:
      return null;
  }
}

export function serializeEvent(event: SidecarEvent): string {
  return `${JSON.stringify(event)}\n`;
}
