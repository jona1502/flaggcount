import { describe, expect, it } from 'vitest';
import { parseTelemetryEnvelope, voteCountBucket } from './analytics';

const envelope = (event: unknown) => ({ event, appVersion: '0.2.3', platform: 'windows', osMajor: '11' });

describe('privacy-first telemetry schema', () => {
  it.each([
    [1, '1-9'],
    [9, '1-9'],
    [10, '10-49'],
    [50, '50-99'],
    [100, '100-499'],
    [500, '500-999'],
    [1000, '1000+']
  ])('buckets %i votes as %s', (count, expected) => {
    expect(voteCountBucket(count)).toBe(expected);
  });

  it('accepts only documented aggregate fields', () => {
    expect(parseTelemetryEnvelope(envelope({ version: 1, name: 'app_started' }))).not.toBeNull();
    expect(
      parseTelemetryEnvelope(envelope({ version: 1, name: 'round_completed', voteCountBucket: '10-49' }))
    ).not.toBeNull();
    expect(parseTelemetryEnvelope(envelope({ version: 1, name: 'overlay_opened', kind: 'local' }))).not.toBeNull();
  });

  it.each([
    envelope({ version: 1, name: 'app_started', deviceId: 'unique' }),
    envelope({ version: 1, name: 'round_completed', voteCountBucket: 42 }),
    envelope({ version: 1, name: 'error', code: 'raw-error-message' }),
    { ...envelope({ version: 1, name: 'app_started' }), username: 'creator' },
    { ...envelope({ version: 1, name: 'app_started' }), appVersion: 'latest' },
    null
  ])('rejects non-allowlisted or identifying payloads: %o', (value) => {
    expect(parseTelemetryEnvelope(value)).toBeNull();
  });
});
