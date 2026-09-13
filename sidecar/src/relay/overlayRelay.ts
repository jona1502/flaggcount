import type { OverlaySettings } from '../../../shared/settings';
import type { VoteSnapshot } from '../../../shared/voting';
import { describeError } from '../logging';
import type { LogLevel } from '../protocol';
import { channelIdForKey, relayOverlayPath } from './relayChannel';

export type RelaySource = {
  getVotes: () => VoteSnapshot;
  subscribeVotes: (listener: (votes: VoteSnapshot) => void) => () => void;
  getOverlaySettings: () => OverlaySettings;
  subscribeOverlaySettings: (listener: (overlay: OverlaySettings) => void) => () => void;
};

export type RelayTiming = {
  fetch?: typeof fetch;
  log?: (level: LogLevel, message: string) => void;
  /** Coalesces bursts of votes into at most one update per interval. */
  minIntervalMs?: number;
  /** Resends the state regularly, so the overlay recovers after a server restart. */
  heartbeatMs?: number;
  retryMs?: number;
  maxRetryMs?: number;
  timeoutMs?: number;
};

export type OverlayRelayOptions = RelayTiming & {
  baseUrl: string;
  key: string;
  source: RelaySource;
};

export type OverlayRelay = {
  publicUrl: string;
  stop(): void;
};

export type RelayPublisherOptions = RelayTiming & {
  endpoint: string;
  /** Read for every request, so credentials that change on the way are always current. */
  headers: () => Record<string, string>;
  body: () => unknown;
  subscribe: (listener: () => void) => () => void;
  /** Used in sanitized log messages, e.g. "Online overlay". */
  name: string;
};

/**
 * Publishes the latest state to one relay channel: coalesces bursts, retries with a growing delay and
 * resends regularly. Only aggregated counts and designs are ever sent.
 */
export function startRelayPublisher(options: RelayPublisherOptions): { stop(): void } {
  const sendRequest = options.fetch ?? fetch;
  const minIntervalMs = options.minIntervalMs ?? 250;
  const retryMs = options.retryMs ?? 5000;
  const maxRetryMs = options.maxRetryMs ?? 60_000;
  const timeoutMs = options.timeoutMs ?? 10_000;

  let stopped = false;
  let inFlight = false;
  let dirty = false;
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (delayMs: number): void => {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, delayMs);
    timer.unref?.();
  };

  const request = (): void => {
    if (stopped) return;
    if (inFlight) {
      dirty = true;
      return;
    }
    const wait = lastSentAt + minIntervalMs - Date.now();
    if (wait > 0) {
      schedule(wait);
    } else {
      void flush();
    }
  };

  const flush = async (): Promise<void> => {
    if (stopped) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    inFlight = true;
    dirty = false;
    lastSentAt = Date.now();
    try {
      const response = await sendRequest(options.endpoint, {
        method: 'PUT',
        headers: options.headers(),
        body: JSON.stringify(options.body()),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (failures > 0) {
        options.log?.('info', `${options.name} is reachable again`);
      }
      failures = 0;
    } catch (error) {
      failures++;
      if (failures === 1) {
        const detail = error instanceof Error && /^HTTP \d{3}$/.test(error.message) ? error.message : describeError(error);
        options.log?.('warn', `${options.name} update failed (${detail}), retrying`);
      }
      // The retry sends the newest state anyway.
      dirty = false;
      schedule(Math.min(retryMs * 2 ** (failures - 1), maxRetryMs));
    } finally {
      inFlight = false;
      if (dirty) request();
    }
  };

  const unsubscribe = options.subscribe(request);
  const heartbeat = setInterval(request, options.heartbeatMs ?? 30_000);
  heartbeat.unref?.();
  request();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      clearInterval(heartbeat);
      unsubscribe();
    }
  };
}

/** Mirrors the vote count and overlay settings to the FlagCount server. Chat content never leaves the app. */
export function startOverlayRelay(options: OverlayRelayOptions): OverlayRelay {
  const { key, source } = options;
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const channelId = channelIdForKey(key);
  const publisher = startRelayPublisher({
    ...options,
    name: 'Online overlay',
    endpoint: `${baseUrl}/api/relay/${channelId}`,
    headers: () => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }),
    body: () => ({ votes: source.getVotes(), overlay: source.getOverlaySettings() }),
    subscribe: (listener) => {
      const unsubscribeVotes = source.subscribeVotes(listener);
      const unsubscribeOverlay = source.subscribeOverlaySettings(listener);
      return () => {
        unsubscribeVotes();
        unsubscribeOverlay();
      };
    }
  });

  return {
    publicUrl: `${baseUrl}${relayOverlayPath(channelId)}`,
    stop: publisher.stop
  };
}
