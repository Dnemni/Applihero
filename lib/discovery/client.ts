"use client";

import { supabase } from "@/lib/supabase/client";

export async function discoveryFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Authentication required");
  return fetch(input, {
    ...init,
    // Discovery pages are backed by the freshly synchronized Supabase catalog;
    // do not let a browser reuse a stale response while the watch list updates.
    cache: "no-store",
    headers: {
      ...init.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}
