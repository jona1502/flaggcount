export type RateLimiterOptions = {
  limit: number;
  windowMs: number;
  now?: () => number;
  /** Bounds memory under attack; the oldest windows are dropped first. */
  maxKeys?: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
};

/** Fixed-window request counter per key, e.g. per client address or per installation. */
export class RateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();
  private readonly now: () => number;
  private readonly maxKeys: number;

  constructor(private readonly options: RateLimiterOptions) {
    this.now = options.now ?? Date.now;
    this.maxKeys = options.maxKeys ?? 10_000;
  }

  consume(key: string): RateLimitDecision {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || now - window.startedAt >= this.options.windowMs) {
      if (!window && this.windows.size >= this.maxKeys) {
        const oldest = this.windows.keys().next().value;
        if (oldest !== undefined) this.windows.delete(oldest);
      }
      window = { startedAt: now, count: 0 };
      this.windows.delete(key);
      this.windows.set(key, window);
    }
    window.count++;
    const allowed = window.count <= this.options.limit;
    const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil((window.startedAt + this.options.windowMs - now) / 1000));
    return { allowed, retryAfterSeconds };
  }
}
