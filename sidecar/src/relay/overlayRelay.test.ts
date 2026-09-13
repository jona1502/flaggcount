import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OVERLAY_SETTINGS, type OverlaySettings } from '../../../shared/settings';
import type { VoteSnapshot } from '../../../shared/voting';
import { startOverlayRelay, type OverlayRelay, type RelaySource } from './overlayRelay';
import { channelIdForKey } from './relayChannel';

const KEY = 'k'.repeat(43);
const BASE_URL = 'https://relay.test/';

class FakeSource implements RelaySource {
  votes: VoteSnapshot = { count: 0, target: 10, roundId: 'r1', targetReached: false };
  overlay: OverlaySettings = { ...DEFAULT_OVERLAY_SETTINGS, showBackground: true, showProgress: true };
  private readonly voteListeners = new Set<(votes: VoteSnapshot) => void>();
  private readonly overlayListeners = new Set<(overlay: OverlaySettings) => void>();

  getVotes = () => this.votes;
  getOverlaySettings = () => this.overlay;

  subscribeVotes = (listener: (votes: VoteSnapshot) => void) => {
    this.voteListeners.add(listener);
    return () => this.voteListeners.delete(listener);
  };

  subscribeOverlaySettings = (listener: (overlay: OverlaySettings) => void) => {
    this.overlayListeners.add(listener);
    return () => this.overlayListeners.delete(listener);
  };

  setCount(count: number): void {
    this.votes = { ...this.votes, count };
    for (const listener of this.voteListeners) listener(this.votes);
  }

  setOverlay(overlay: OverlaySettings): void {
    this.overlay = overlay;
    for (const listener of this.overlayListeners) listener(overlay);
  }
}

const ok = { ok: true, status: 204 } as Response;
let relay: OverlayRelay | null = null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  relay?.stop();
  relay = null;
  vi.useRealTimers();
});

function start(source: FakeSource, fetchRelay: typeof fetch, log = vi.fn()) {
  relay = startOverlayRelay({ baseUrl: BASE_URL, key: KEY, source, fetch: fetchRelay, log, heartbeatMs: 30_000 });
  return relay;
}

const bodyOf = (call: Parameters<typeof fetch> | undefined) => JSON.parse(String(call?.[1]?.body));

describe('startOverlayRelay', () => {
  it('publishes the current state right away to the channel of its key', async () => {
    const fetchRelay = vi.fn<typeof fetch>(async () => ok);
    const source = new FakeSource();

    const { publicUrl } = start(source, fetchRelay);
    await vi.advanceTimersByTimeAsync(0);

    const channelId = channelIdForKey(KEY);
    expect(publicUrl).toBe(`https://relay.test/o/${channelId}`);
    const [url, init] = fetchRelay.mock.calls[0] ?? [];
    expect(url).toBe(`https://relay.test/api/relay/${channelId}`);
    expect(init?.method).toBe('PUT');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${KEY}`);
    expect(bodyOf(fetchRelay.mock.calls[0])).toEqual({ votes: source.votes, overlay: source.overlay });
  });

  it('coalesces bursts of votes into the latest state', async () => {
    const fetchRelay = vi.fn<typeof fetch>(async () => ok);
    const source = new FakeSource();
    start(source, fetchRelay);
    await vi.advanceTimersByTimeAsync(0);

    for (let count = 1; count <= 5; count++) source.setCount(count);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchRelay).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(250);
    expect(fetchRelay).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchRelay.mock.calls[1]).votes.count).toBe(5);
  });

  it('publishes overlay settings changes', async () => {
    const fetchRelay = vi.fn<typeof fetch>(async () => ok);
    const source = new FakeSource();
    start(source, fetchRelay);
    await vi.advanceTimersByTimeAsync(0);

    source.setOverlay({ ...DEFAULT_OVERLAY_SETTINGS, showBackground: false, showProgress: false });
    await vi.advanceTimersByTimeAsync(250);

    expect(bodyOf(fetchRelay.mock.calls.at(-1)).overlay).toEqual({ ...DEFAULT_OVERLAY_SETTINGS, showBackground: false, showProgress: false });
  });

  it('retries with a growing delay and logs the failure once', async () => {
    const fetchRelay = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValue(ok);
    const log = vi.fn();
    start(new FakeSource(), fetchRelay, log);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchRelay).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(9999);
    expect(fetchRelay).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchRelay).toHaveBeenCalledTimes(3);

    expect(log).toHaveBeenCalledWith('warn', 'Online overlay update failed (TypeError), retrying');
    expect(log).toHaveBeenCalledWith('info', 'Online overlay is reachable again');
    expect(JSON.stringify(log.mock.calls)).not.toContain(KEY);
  });

  it('resends the state as a heartbeat and stops cleanly', async () => {
    const fetchRelay = vi.fn<typeof fetch>(async () => ok);
    const source = new FakeSource();
    const started = start(source, fetchRelay);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchRelay).toHaveBeenCalledTimes(2);

    started.stop();
    source.setCount(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchRelay).toHaveBeenCalledTimes(2);
  });
});
