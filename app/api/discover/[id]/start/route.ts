import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { getDiscoveryJob } from "@/lib/discovery/repository";
import { supabaseAdmin } from "@/lib/supabase/client";
import { fetchApplicationForm, saveApplicationFormSnapshot } from "@/lib/applications/form-snapshot";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser(request);
    const db = supabaseAdmin as any;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)) {
      return NextResponse.json({ error: "Invalid job" }, { status: 400 });
    }
    const { data: created, error } = await db.rpc("start_discovery_workspace", {
      p_user_id: user.id, p_discovery_job_id: params.id,
    });
    if (error?.code === "PGRST202") return NextResponse.json({ error: "Application setup is being updated. Please try again shortly." }, { status: 503 });
    if (error) throw error;
    if (created?.unavailable) return NextResponse.json({ error: "Job is no longer available" }, { status: 404 });
    if (created.existing) return NextResponse.json(created);

    let formImport = { imported: 0, available: false };
    try {
      const job = await getDiscoveryJob(params.id);
      if (!job) return NextResponse.json({ ...created, formImport });
      const input = await fetchApplicationForm(job);
      const result = await saveApplicationFormSnapshot({ jobId: created.jobId, userId: user.id, input });
      formImport = { imported: result.fields.length, available: result.available };
    } catch (formError) {
      console.warn("Application form import was not available:", formError);
    }

    return NextResponse.json({ ...created, formImport });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    console.error("Start application error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start application" }, { status });
  }
}
