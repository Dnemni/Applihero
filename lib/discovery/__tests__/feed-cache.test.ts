import assert from "node:assert/strict";
import test from "node:test";
import { BoundedFeedCache, feedCacheKey } from "../feed-cache";

test("cache keys include every input that changes a page", () => {
  const base = { userId: "u1", scope: "matches" as const, offset: 0, limit: 50 };
  assert.equal(feedCacheKey(base), feedCacheKey({ ...base, query: "  " }));
  assert.notEqual(feedCacheKey(base), feedCacheKey({ ...base, offset: 50 }));
  assert.notEqual(feedCacheKey(base), feedCacheKey({ ...base, scope: "all" }));
  assert.notEqual(feedCacheKey(base), feedCacheKey({ ...base, userId: "u2" }));
  assert.notEqual(feedCacheKey(base), feedCacheKey({ ...base, freshness: "7" }));
  assert.notEqual(feedCacheKey(base), feedCacheKey({ ...base, useSavedLocation: true }));
  assert.equal(feedCacheKey({ ...base, company: "Roblox" }), feedCacheKey({ ...base, company: " roblox " }));
});

test("entries expire, the least recently used entry is evicted, and invalidation clears everything", () => {
  const cache = new BoundedFeedCache<number>({ maxEntries: 2, ttlMs: 1_000 });
  cache.set("a", 1, 0);
  cache.set("b", 2, 0);
  assert.equal(cache.get("a", 500), 1);
  cache.set("c", 3, 500);
  assert.equal(cache.get("b", 500), undefined, "b was least recently used");
  assert.equal(cache.get("a", 500), 1);
  assert.equal(cache.get("a", 1_600), undefined, "expired");
  cache.set("d", 4, 1_600);
  cache.invalidate();
  assert.equal(cache.size, 0);
});

test("concurrent identical loads share one request and a mutation during flight prevents caching", async () => {
  const cache = new BoundedFeedCache<string>({ maxEntries: 5, ttlMs: 10_000 });
  let calls = 0;
  let release: (value: string) => void = () => {};
  const loader = () => { calls += 1; return new Promise<string>(resolve => { release = resolve; }); };
  const first = cache.load("k", loader);
  const second = cache.load("k", loader);
  assert.equal(calls, 1);
  release("page");
  assert.deepEqual(await Promise.all([first, second]), ["page", "page"]);
  assert.equal(cache.get("k"), "page");

  cache.invalidate();
  const third = cache.load("k", loader);
  cache.invalidate();
  release("stale");
  assert.equal(await third, "stale");
  assert.equal(cache.get("k"), undefined, "result from before the invalidation is not kept");
});
