import type { CounterView } from '../../../shared/overlayBoard';
import type { OverlaySettings } from '../../../shared/settings';
import type { VoteSnapshot } from '../../../shared/voting';

/** The classic overlay of one desktop app. */
export type RelayUpdate = {
  votes: VoteSnapshot;
  overlay: OverlaySettings;
};

/** A Pro overlay for one counter or the overview of all running counters. */
export type BoardRelayUpdate = {
  scope: string;
  counters: CounterView[];
};

export type PublishResult = 'ok' | 'rate-limited' | 'full';

export type RelayChannelsOptions = {
  maxChannels?: number;
  maxSubscribers?: number;
  /** Channels without updates and viewers for this long make room for new ones. */
  idleMs?: number;
  maxPublishesPerWindow?: number;
  windowMs?: number;
  now?: () => number;
};

type Channel<Update> = {
  update: Update;
  updatedAt: number;
  windowStart: number;
  publishes: number;
};

type Listener<Update> = (update: Update) => void;

/** In-memory latest state per desktop app; the apps resend it regularly after a server restart. */
export class RelayChannels<Update = RelayUpdate> {
  private readonly channels = new Map<string, Channel<Update>>();
  private readonly listeners = new Map<string, Set<Listener<Update>>>();
  private subscribers = 0;
  private readonly maxChannels: number;
  private readonly maxSubscribers: number;
  private readonly idleMs: number;
  private readonly maxPublishesPerWindow: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(options: RelayChannelsOptions = {}) {
    this.maxChannels = options.maxChannels ?? 1000;
    this.maxSubscribers = options.maxSubscribers ?? 5000;
    this.idleMs = options.idleMs ?? 24 * 60 * 60_000;
    this.maxPublishesPerWindow = options.maxPublishesPerWindow ?? 60;
    this.windowMs = options.windowMs ?? 10_000;
    this.now = options.now ?? Date.now;
  }

  publish(channelId: string, update: Update): PublishResult {
    const now = this.now();
    let channel = this.channels.get(channelId);
    if (!channel) {
      this.evictIdle(now);
      if (this.channels.size >= this.maxChannels) {
        return 'full';
      }
      channel = { update, updatedAt: now, windowStart: now, publishes: 0 };
      this.channels.set(channelId, channel);
    }

    if (now - channel.windowStart >= this.windowMs) {
      channel.windowStart = now;
      channel.publishes = 0;
    }
    if (++channel.publishes > this.maxPublishesPerWindow) {
      return 'rate-limited';
    }

    channel.update = update;
    channel.updatedAt = now;
    for (const listener of this.listeners.get(channelId) ?? []) {
      listener(update);
    }
    return 'ok';
  }

  get(channelId: string): Update | null {
    return this.channels.get(channelId)?.update ?? null;
  }

  /** Returns the unsubscribe function, or `null` while the server is at its viewer limit. */
  subscribe(channelId: string, listener: Listener<Update>): (() => void) | null {
    if (this.subscribers >= this.maxSubscribers) {
      return null;
    }
    let channelListeners = this.listeners.get(channelId);
    if (!channelListeners) {
      channelListeners = new Set();
      this.listeners.set(channelId, channelListeners);
    }
    const listeners = channelListeners;
    listeners.add(listener);
    this.subscribers++;

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(listener);
      this.subscribers--;
      if (listeners.size === 0 && this.listeners.get(channelId) === listeners) {
        this.listeners.delete(channelId);
      }
    };
  }

  private evictIdle(now: number): void {
    for (const [channelId, channel] of this.channels) {
      if (now - channel.updatedAt >= this.idleMs && !this.listeners.has(channelId)) {
        this.channels.delete(channelId);
      }
    }
  }
}
