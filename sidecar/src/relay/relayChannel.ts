import { createHash } from 'node:crypto';
import { isValidTarget, type VoteSnapshot } from '../../../shared/voting';

/** The FlagCount server that mirrors the app's overlay for streaming tools like TikTok LIVE Studio. */
export const DEFAULT_RELAY_URL = 'https://overlay.muhrindustries.com';

const RELAY_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CHANNEL_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const MAX_VOTE_COUNT = 1_000_000_000;
const MAX_ROUND_ID_LENGTH = 100;

/** A relay key is 32 random bytes in base64url. */
export function isRelayKey(value: unknown): value is string {
  return typeof value === 'string' && RELAY_KEY_PATTERN.test(value);
}

/**
 * Public channel id derived from the secret key: anyone with the overlay URL can watch,
 * but only the app holding the key can publish to it. The server needs no stored accounts.
 */
export function channelIdForKey(key: string): string {
  return createHash('sha256').update(key).digest('base64url').slice(0, 22);
}

export function isChannelId(value: string): boolean {
  return CHANNEL_ID_PATTERN.test(value);
}

export function relayOverlayPath(channelId: string): string {
  return `/o/${channelId}`;
}

export function parseVoteSnapshot(value: unknown): VoteSnapshot | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { count, target, roundId, targetReached } = value as Record<string, unknown>;
  const valid =
    typeof count === 'number' &&
    Number.isInteger(count) &&
    count >= 0 &&
    count <= MAX_VOTE_COUNT &&
    typeof target === 'number' &&
    isValidTarget(target) &&
    typeof roundId === 'string' &&
    roundId.length <= MAX_ROUND_ID_LENGTH &&
    typeof targetReached === 'boolean';
  return valid ? { count, target, roundId, targetReached } : null;
}
