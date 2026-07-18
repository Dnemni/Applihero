import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { buildQuickFit } from "@/lib/discovery/matcher";
import { getDiscoveryJob, getUserBackground } from "@/lib/discovery/repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser(request);
    const [job, background] = await Promise.all([
      getDiscoveryJob(params.id),
      getUserBackground(user.id),
    ]);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    return NextResponse.json({
      job,
      quickFit: buildQuickFit(job, background),
      hasBackground: Boolean(background.trim()),
    });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    console.error("Discover detail error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load job" }, { status });
  }
}
