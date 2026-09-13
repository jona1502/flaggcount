export const TELEMETRY_EVENT_NAMES = [
  'app_started',
  'connection_succeeded',
  'round_completed',
  'overlay_opened',
  'profile_created',
  'pro_viewed',
  'checkout_started',
  'license_activated',
  'error'
] as const;

export const VOTE_COUNT_BUCKETS = ['1-9', '10-49', '50-99', '100-499', '500-999', '1000+'] as const;
export const TELEMETRY_ERROR_CODES = [
  'invalid-username',
  'user-offline',
  'user-not-found',
  'rate-limited',
  'network',
  'stream-ended',
  'reconnect-failed',
  'invalid-target',
  'invalid-overlay-settings',
  'sidecar-unavailable',
  'unknown'
] as const;

export type VoteCountBucket = (typeof VOTE_COUNT_BUCKETS)[number];
export type TelemetryErrorCode = (typeof TELEMETRY_ERROR_CODES)[number];

export type TelemetryEvent =
  | { version: 1; name: 'app_started' | 'connection_succeeded' | 'profile_created' | 'pro_viewed' | 'checkout_started' | 'license_activated' }
  | { version: 1; name: 'round_completed'; voteCountBucket: VoteCountBucket }
  | { version: 1; name: 'overlay_opened'; kind: 'local' | 'online' }
  | { version: 1; name: 'error'; code: TelemetryErrorCode };

export type TelemetryEnvelope = {
  event: TelemetryEvent;
  appVersion: string;
  platform: 'windows' | 'macos' | 'linux' | 'unknown';
  osMajor: string;
};

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const OS_MAJOR_PATTERN = /^\d{1,3}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const onlyKeys = (record: Record<string, unknown>, expected: readonly string[]): boolean =>
  Object.keys(record).every((key) => expected.includes(key)) && expected.every((key) => key in record);

export function voteCountBucket(count: number): VoteCountBucket {
  if (count < 10) return '1-9';
  if (count < 50) return '10-49';
  if (count < 100) return '50-99';
  if (count < 500) return '100-499';
  if (count < 1000) return '500-999';
  return '1000+';
}

/** Strictly parses the complete allowlisted payload; free-form fields are never accepted. */
export function parseTelemetryEnvelope(value: unknown): TelemetryEnvelope | null {
  if (!isRecord(value) || !onlyKeys(value, ['event', 'appVersion', 'platform', 'osMajor'])) return null;
  const { event, appVersion, platform, osMajor } = value;
  if (
    !isRecord(event) ||
    typeof appVersion !== 'string' ||
    !VERSION_PATTERN.test(appVersion) ||
    !['windows', 'macos', 'linux', 'unknown'].includes(String(platform)) ||
    typeof osMajor !== 'string' ||
    !OS_MAJOR_PATTERN.test(osMajor)
  ) {
    return null;
  }

  let parsedEvent: TelemetryEvent | null = null;
  switch (event['name']) {
    case 'app_started':
    case 'connection_succeeded':
    case 'profile_created':
    case 'pro_viewed':
    case 'checkout_started':
    case 'license_activated':
      if (event['version'] === 1 && onlyKeys(event, ['version', 'name'])) {
        parsedEvent = event as TelemetryEvent;
      }
      break;
    case 'round_completed':
      if (
        event['version'] === 1 &&
        onlyKeys(event, ['version', 'name', 'voteCountBucket']) &&
        VOTE_COUNT_BUCKETS.includes(event['voteCountBucket'] as VoteCountBucket)
      ) {
        parsedEvent = event as TelemetryEvent;
      }
      break;
    case 'overlay_opened':
      if (
        event['version'] === 1 &&
        onlyKeys(event, ['version', 'name', 'kind']) &&
        (event['kind'] === 'local' || event['kind'] === 'online')
      ) {
        parsedEvent = event as TelemetryEvent;
      }
      break;
    case 'error':
      if (
        event['version'] === 1 &&
        onlyKeys(event, ['version', 'name', 'code']) &&
        TELEMETRY_ERROR_CODES.includes(event['code'] as TelemetryErrorCode)
      ) {
        parsedEvent = event as TelemetryEvent;
      }
      break;
  }

  return parsedEvent
    ? { event: parsedEvent, appVersion, platform: platform as TelemetryEnvelope['platform'], osMajor }
    : null;
}
