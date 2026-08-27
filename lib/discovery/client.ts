"use client";

import { supabase } from "@/lib/supabase/client";

export async function discoveryFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Authentication required");
  return fetch(input, {
    ...init,
    // The server returns a short, private freshness window for read-only feed
    // requests. This makes back/forward navigation feel immediate while never
    // sharing one user's recommendations with another user.
    cache: init.cache || (String(init.method || "GET").toUpperCase() === "GET" ? "default" : "no-store"),
    headers: {
      ...init.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}
