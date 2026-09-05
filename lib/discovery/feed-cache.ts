/**
 * Bounded client-side cache for feed pages. Authenticated responses are sent
 * with `Cache-Control: no-store`, so this is the only cache layer: it is keyed
 * by user and every filter that changes the result, capped in size and age,
 * deduplicates concurrent identical requests, and is cleared whenever the user
 * changes something that affects matches (follows, preferences, rescans,
 * rematches). Card payloads carry no descriptions, so entries stay small.
 */
export type FeedCacheKeyParts = {
  userId: string;
  scope: "matches" | "all";
  query?: string;
  company?: string;
  location?: string;
  workplace?: string;
  freshness?: string;
  useSavedLocation?: boolean;
  offset: number;
  limit: number;
};

export function feedCacheKey(parts: FeedCacheKeyParts) {
  return [
    parts.userId, parts.scope,
    `q=${(parts.query || "").trim().toLowerCase()}`, `c=${(parts.company || "").trim().toLowerCase()}`,
    `l=${(parts.location || "").trim().toLowerCase()}`, `w=${(parts.workplace || "").trim().toLowerCase()}`,
    `f=${parts.freshness || ""}`, `saved=${parts.useSavedLocation ? "1" : "0"}`, `o=${parts.offset}`, `n=${parts.limit}`,
  ].join("|");
}

export class BoundedFeedCache<T> {
  private readonly entries = new Map<string, { value: T; storedAt: number }>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private generation = 0;

  constructor(private readonly options: { maxEntries: number; ttlMs: number } = { maxEntries: 40, ttlMs: 60_000 }) {}

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (now - entry.storedAt > this.options.ttlMs) { this.entries.delete(key); return undefined; }
    // Re-insert to mark as most recently used.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()) {
    this.entries.delete(key);
    this.entries.set(key, { value, storedAt: now });
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  /** Returns a cached value, joins an identical in-flight request, or runs the loader once. */
  async load(key: string, loader: () => Promise<T>, now = Date.now()): Promise<T> {
    const cached = this.get(key, now);
    if (cached !== undefined) return cached;
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const generation = this.generation;
    const promise = loader().then(value => {
      // A mutation during the request means the answer may already be stale; return it but do not keep it.
      if (generation === this.generation) this.set(key, value);
      return value;
    }).finally(() => { if (this.inFlight.get(key) === promise) this.inFlight.delete(key); });
    this.inFlight.set(key, promise);
    return promise;
  }

  invalidate() {
    this.generation += 1;
    this.entries.clear();
    this.inFlight.clear();
  }

  get size() { return this.entries.size; }
}
