import { NextRequest, NextResponse } from "next/server";
import { hasCronAuthorization } from "@/lib/discovery/cron";
import { enqueueHourlyDiscoveryTasks } from "@/lib/discovery/ingestion-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  if (!hasCronAuthorization(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Kept as a compatibility entrypoint for Vercel's existing cron config.
    // It only enqueues; source scans now belong to bounded worker requests.
    return NextResponse.json(await enqueueHourlyDiscoveryTasks());
  } catch (error) {
    console.error("Scheduled discovery scan failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scan failed" }, { status: 500 });
  }
}
