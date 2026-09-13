import { release } from 'node:os';
import type { TelemetryEnvelope, TelemetryEvent } from '../../shared/analytics';

export type TelemetrySender = (event: TelemetryEvent) => void;

type AnalyticsClientOptions = {
  baseUrl: string;
  appVersion: string;
  fetch?: typeof fetch;
  platform?: NodeJS.Platform;
  osRelease?: string;
};

const telemetryPlatform = (platform: NodeJS.Platform): TelemetryEnvelope['platform'] => {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  return 'unknown';
};

const osMajor = (value: string): string => {
  const major = value.match(/^\d{1,3}/)?.[0];
  return major ?? '0';
};

/** Sends only schema-checked aggregate events and deliberately keeps no installation identifier. */
export class AnalyticsClient {
  private enabled = false;
  private readonly endpoint: string;
  private readonly sendRequest: typeof fetch;
  private readonly envelope: Omit<TelemetryEnvelope, 'event'>;

  constructor(options: AnalyticsClientOptions) {
    this.endpoint = new URL('/api/v1/analytics/events', options.baseUrl).href;
    this.sendRequest = options.fetch ?? fetch;
    this.envelope = {
      appVersion: options.appVersion,
      platform: telemetryPlatform(options.platform ?? process.platform),
      osMajor: osMajor(options.osRelease ?? release())
    };
  }

  setEnabled(enabled: boolean): void {
    const justEnabled = enabled && !this.enabled;
    this.enabled = enabled;
    if (justEnabled) this.track({ version: 1, name: 'app_started' });
  }

  track(event: TelemetryEvent): void {
    if (!this.enabled) return;
    void this.sendRequest(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...this.envelope, event }),
      signal: AbortSignal.timeout(5_000)
    }).catch(() => undefined);
  }
}
