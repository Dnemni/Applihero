"use client";

import { supabase } from "@/lib/supabase/client";
import { BoundedFeedCache, feedCacheKey, type FeedCacheKeyParts } from "./feed-cache";
import type { DiscoveryFeedResponse } from "./types";

export async function discoverySession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Authentication required");
  return session;
}

export async function discoveryFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const session = await discoverySession();
  return fetch(input, {
    ...init,
    // Responses are per-user and marked no-store by the server; the bounded
    // in-memory feed cache below is the only client cache layer.
    cache: init.cache || "no-store",
    headers: {
      ...init.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}

const feedCache = new BoundedFeedCache<DiscoveryFeedResponse>({ maxEntries: 40, ttlMs: 60_000 });

export type DiscoveryFeedRequest = Omit<FeedCacheKeyParts, "userId">;

/** Loads one feed page through the bounded cache, deduplicating identical concurrent requests. */
export async function fetchDiscoveryFeedPage(request: DiscoveryFeedRequest): Promise<DiscoveryFeedResponse> {
  const session = await discoverySession();
  const key = feedCacheKey({ ...request, userId: session.user.id });
  return feedCache.load(key, async () => {
    const params = new URLSearchParams();
    if (request.query?.trim()) params.set("query", request.query.trim());
    if (request.company?.trim()) params.set("company", request.company.trim());
    if (request.location?.trim()) params.set("location", request.location.trim());
    if (request.workplace) params.set("workplace", request.workplace);
    if (request.freshness) params.set("freshness", request.freshness);
    if (request.useSavedLocation) params.set("useSavedLocation", "1");
    params.set("scope", request.scope);
    params.set("limit", String(request.limit));
    if (request.offset) params.set("offset", String(request.offset));
    const response = await discoveryFetch(`/api/discover?${params}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load jobs");
    return payload as DiscoveryFeedResponse;
  });
}

/** Call after any mutation that can change matches: follows, preferences, answers, rescans, rematches. */
export function invalidateDiscoveryFeedCache() {
  feedCache.invalidate();
}
