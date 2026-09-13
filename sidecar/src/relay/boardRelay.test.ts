import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignedEntitlement } from '../../../shared/licensing';
import type { BoardAccess, CounterView } from '../../../shared/overlayBoard';
import { DEFAULT_OVERLAY_SETTINGS } from '../../../shared/settings';
import { boardChannelKey, startBoardRelays, type BoardRelays } from './boardRelay';
import { channelIdForKey, isRelayKey } from './relayChannel';

const MASTER = 'm'.repeat(43);
const ENTITLEMENT = { licenseId: 'license-1', signature: 'signed' } as unknown as SignedEntitlement;

const view = (counterId: string): CounterView => ({
  counterId,
  name: counterId,
  mode: 'single',
  options: [{ optionId: 'o', label: 'O', count: 1, color: '#e82634' }],
  totalCount: 1,
  target: 10,
  targetReached: false,
  overlay: DEFAULT_OVERLAY_SETTINGS
});

class FakeSource {
  scopes = ['red-flags', 'all'];
  private readonly listeners = new Set<() => void>();

  getBoard = (scope: string): BoardAccess =>
    this.scopes.includes(scope) ? { status: 'ok', counters: scope === 'all' ? [view('red-flags'), view('teams')] : [view(scope)] } : { status: 'pro-required' };
  getBoardScopes = () => this.scopes;
  subscribeBoard = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  change(scopes: string[]): void {
    this.scopes = scopes;
    for (const listener of [...this.listeners]) listener();
  }
}

let relays: BoardRelays | null = null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  relays?.stop();
  relays = null;
  vi.useRealTimers();
});

describe('boardChannelKey', () => {
  it('derives a stable, distinct relay key per overlay', () => {
    const key = boardChannelKey(MASTER, 'teams');

    expect(isRelayKey(key)).toBe(true);
    expect(boardChannelKey(MASTER, 'teams')).toBe(key);
    expect(boardChannelKey(MASTER, 'all')).not.toBe(key);
    expect(boardChannelKey('n'.repeat(43), 'teams')).not.toBe(key);
  });
});

describe('startBoardRelays', () => {
  it('publishes every allowed overlay with the entitlement and reports its URLs', async () => {
    const fetchRelay = vi.fn<typeof fetch>(async () => ({ ok: true, status: 204 }) as Response);
    const onUrls = vi.fn();
    const source = new FakeSource();

    relays = startBoardRelays({ baseUrl: 'https://relay.test/', masterKey: MASTER, source, entitlement: () => ENTITLEMENT, onUrls, fetch: fetchRelay });
    await vi.advanceTimersByTimeAsync(0);

    const counterChannel = channelIdForKey(boardChannelKey(MASTER, 'red-flags'));
    const overviewChannel = channelIdForKey(boardChannelKey(MASTER, 'all'));
    expect(onUrls).toHaveBeenCalledWith({
      all: `https://relay.test/ob/${overviewChannel}`,
      'red-flags': `https://relay.test/ob/${counterChannel}`
    });
    const request = fetchRelay.mock.calls.find(([url]) => String(url).endsWith(counterChannel));
    expect(request?.[0]).toBe(`https://relay.test/api/relay/board/${counterChannel}`);
    const headers = request?.[1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${boardChannelKey(MASTER, 'red-flags')}`);
    expect(JSON.parse(Buffer.from(headers['X-FlagCount-Entitlement'] ?? '', 'base64url').toString())).toEqual(ENTITLEMENT);
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ scope: 'red-flags', counters: [view('red-flags')] });
  });

  it('follows the running counters and stops without Pro', async () => {
    const fetchRelay = vi.fn<typeof fetch>(async () => ({ ok: true, status: 204 }) as Response);
    const onUrls = vi.fn();
    const source = new FakeSource();
    let entitlement: SignedEntitlement | null = ENTITLEMENT;
    relays = startBoardRelays({ baseUrl: 'https://relay.test', masterKey: MASTER, source, entitlement: () => entitlement, onUrls, fetch: fetchRelay, heartbeatMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);

    source.change(['red-flags', 'teams', 'all']);
    expect(Object.keys(onUrls.mock.lastCall?.[0] ?? {})).toEqual(['all', 'red-flags', 'teams']);

    entitlement = null;
    source.change(['red-flags', 'teams', 'all']);
    expect(onUrls).toHaveBeenLastCalledWith({});
    const calls = fetchRelay.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchRelay.mock.calls.length).toBe(calls);
  });

  it('starts nothing on Free', async () => {
    const fetchRelay = vi.fn<typeof fetch>();
    const onUrls = vi.fn();

    relays = startBoardRelays({ baseUrl: 'https://relay.test', masterKey: MASTER, source: new FakeSource(), entitlement: () => null, onUrls, fetch: fetchRelay });
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchRelay).not.toHaveBeenCalled();
    expect(onUrls).not.toHaveBeenCalled();
  });
});
