import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { getDiscoveryJob } from "@/lib/discovery/repository";
import { supabaseAdmin } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser(request);
    const job = await getDiscoveryJob(params.id);
    if (!job || job.status === "closed") return NextResponse.json({ error: "Job is no longer available" }, { status: 404 });
    const db = supabaseAdmin as any;

    const { data: existing, error: existingError } = await db
      .from("jobs")
      .select("id")
      .eq("user_id", user.id)
      .eq("discovery_job_id", job.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return NextResponse.json({ jobId: existing.id, existing: true });

    const { data: created, error } = await db.from("jobs").insert({
      user_id: user.id,
      discovery_job_id: job.id,
      job_title: job.title,
      company_name: job.company_name,
      job_description: job.description,
      status: "Draft",
    }).select("id").single();
    if (error) throw error;

    return NextResponse.json({ jobId: created.id, existing: false });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    console.error("Start application error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start application" }, { status });
  }
}
