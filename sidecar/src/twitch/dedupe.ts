/** Bounded TTL/LRU set for providers such as EventSub that deliver at least once. */
export class MessageDedupe {
  private readonly seen = new Map<string, number>();
  constructor(private readonly maxSize = 2000, private readonly ttlMs = 10 * 60_000, private readonly now = Date.now) {}

  accept(id: string): boolean {
    const now = this.now();
    for (const [key, expires] of this.seen) {
      if (expires > now) break;
      this.seen.delete(key);
    }
    if (this.seen.has(id)) return false;
    this.seen.set(id, now + this.ttlMs);
    while (this.seen.size > this.maxSize) this.seen.delete(this.seen.keys().next().value as string);
    return true;
  }
}
