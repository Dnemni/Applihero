import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { getDiscoveryJob } from "@/lib/discovery/repository";
import { supabaseAdmin } from "@/lib/supabase/client";
import { fetchApplicationForm, saveApplicationFormSnapshot, type ApplicationFormField, type ApplicationFormSnapshotInput } from "@/lib/applications/form-snapshot";

function cleanField(value: any, index: number): ApplicationFormField {
  const allowed = new Set(["text", "textarea", "select", "multiselect", "file", "checkbox", "hidden", "unknown"]);
  return {
    externalKey: String(value.externalKey || `observed-${index}`).slice(0, 300),
    label: String(value.label || "Application field").replace(/\s+/g, " ").trim().slice(0, 1000),
    fieldType: allowed.has(value.fieldType) ? value.fieldType : "unknown",
    required: Boolean(value.required), options: Array.isArray(value.options) ? value.options.map(String).slice(0, 100) : [],
    section: String(value.section || "Application").slice(0, 100), helpText: value.helpText ? String(value.helpText).slice(0, 2000) : null,
  };
}

async function ownedJob(userId: string, jobId: string) {
  const { data, error } = await (supabaseAdmin as any).from("jobs").select("id,discovery_job_id").eq("id", jobId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Application not found");
  return data;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser(request);
    const application = await ownedJob(user.id, params.id);
    const body = await request.json().catch(() => ({}));
    let input: ApplicationFormSnapshotInput;
    if (body.fields) {
      const url = new URL(String(body.sourceUrl || ""));
      if (url.protocol !== "https:") return NextResponse.json({ error: "Application snapshots require a public HTTPS source URL" }, { status: 400 });
      input = {
        source: body.source === "browser_extension" ? "browser_extension" : "manual",
        sourceUrl: url.toString(), provider: String(body.provider || "career_site").slice(0, 100),
        fields: (Array.isArray(body.fields) ? body.fields : []).slice(0, 150).map(cleanField), rawPayload: body.metadata || {},
      };
    } else {
      if (!application.discovery_job_id) return NextResponse.json({ error: "This application is not linked to a discovery posting" }, { status: 400 });
      const job = await getDiscoveryJob(application.discovery_job_id);
      if (!job) return NextResponse.json({ error: "Discovery posting not found" }, { status: 404 });
      input = await fetchApplicationForm(job);
    }
    const result = await saveApplicationFormSnapshot({ jobId: params.id, userId: user.id, input });
    return NextResponse.json({ ...result, provider: input.provider, sourceUrl: input.sourceUrl });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : error instanceof Error && error.message === "Application not found" ? 404 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to import application form" }, { status });
  }
}
