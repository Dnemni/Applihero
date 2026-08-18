import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { supabaseAdmin } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const { data, error } = await (supabaseAdmin as any).from("discovery_notifications")
      .select("id, kind, title, body, job_ids, read_at, created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
    if (error) throw error;
    return NextResponse.json({ notifications: data || [] });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load notifications" }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json();
    let query = (supabaseAdmin as any).from("discovery_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id);
    if (body.id) query = query.eq("id", body.id); else query = query.is("read_at", null);
    const { error } = await query;
    if (error) throw error;
    return NextResponse.json({ updated: true });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update notifications" }, { status });
  }
}
