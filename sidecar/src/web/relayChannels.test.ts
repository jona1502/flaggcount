import { describe, expect, it, vi } from 'vitest';
import { RelayChannels, type RelayUpdate } from './relayChannels';

const update = (count: number): RelayUpdate => ({
  votes: { count, target: 10, roundId: 'r1', targetReached: false },
  overlay: { showBackground: true, showProgress: true }
});

describe('RelayChannels', () => {
  it('keeps the latest update per channel and notifies its viewers', () => {
    const channels = new RelayChannels();
    const listener = vi.fn();
    const other = vi.fn();
    const unsubscribe = channels.subscribe('a', listener);
    channels.subscribe('b', other);

    expect(channels.publish('a', update(1))).toBe('ok');
    expect(channels.publish('a', update(2))).toBe('ok');

    expect(channels.get('a')).toEqual(update(2));
    expect(channels.get('b')).toBeNull();
    expect(listener).toHaveBeenLastCalledWith(update(2));
    expect(other).not.toHaveBeenCalled();

    unsubscribe?.();
    unsubscribe?.();
    channels.publish('a', update(3));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('limits how often one app may publish', () => {
    let clock = 0;
    const channels = new RelayChannels({ maxPublishesPerWindow: 2, windowMs: 1000, now: () => clock });

    expect(channels.publish('a', update(1))).toBe('ok');
    expect(channels.publish('a', update(2))).toBe('ok');
    expect(channels.publish('a', update(3))).toBe('rate-limited');
    expect(channels.get('a')).toEqual(update(2));

    clock = 1000;
    expect(channels.publish('a', update(4))).toBe('ok');
  });

  it('makes room for new channels only by dropping idle ones without viewers', () => {
    let clock = 0;
    const channels = new RelayChannels({ maxChannels: 2, idleMs: 1000, now: () => clock });
    channels.publish('a', update(1));
    channels.publish('b', update(1));
    channels.subscribe('b', vi.fn());

    expect(channels.publish('c', update(1))).toBe('full');

    clock = 1000;
    expect(channels.publish('c', update(1))).toBe('ok');
    expect(channels.get('a')).toBeNull();
    expect(channels.get('b')).toEqual(update(1));
  });

  it('refuses viewers beyond the limit', () => {
    const channels = new RelayChannels({ maxSubscribers: 1 });

    const first = channels.subscribe('a', vi.fn());
    expect(channels.subscribe('a', vi.fn())).toBeNull();

    first?.();
    expect(channels.subscribe('a', vi.fn())).not.toBeNull();
  });
});
