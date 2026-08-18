import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { supabaseAdmin } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

const db = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured");
  return supabaseAdmin as any;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const { data, error } = await db().from("profiles")
      .select("onboarding_phase, onboarding_step, onboarding_completed_phases, onboarding_job_id")
      .eq("id", user.id)
      .single();
    if (error) throw error;
    return NextResponse.json({ state: {
      phase: data.onboarding_phase || "profile",
      step: data.onboarding_step || 0,
      completedPhases: data.onboarding_completed_phases || [],
      jobId: data.onboarding_job_id || undefined,
    } });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    console.error("Onboarding load error:", error);
    return NextResponse.json({ error: errorMessage(error, "Unable to load onboarding") }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json();
    const { error } = await db().from("profiles").update({
      onboarding_phase: body.phase,
      onboarding_step: body.step || 0,
      onboarding_completed_phases: body.completedPhases || [],
      onboarding_job_id: body.jobId || null,
    }).eq("id", user.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    console.error("Onboarding save error:", error);
    return NextResponse.json({ error: errorMessage(error, "Unable to save onboarding") }, { status });
  }
}
