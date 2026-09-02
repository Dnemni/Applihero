import { NextRequest, NextResponse } from "next/server";
import { hasCronAuthorization } from "@/lib/discovery/cron";
import { drainDiscoveryIngestionWorker } from "@/lib/discovery/ingestion-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Distinct paths let Vercel Cron schedule four independent lanes at the same
// hour. The lane is intentionally not used for task assignment: Postgres
// claims work atomically, so any healthy lane can finish any source.
export async function GET(request: NextRequest) {
  if (!hasCronAuthorization(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await drainDiscoveryIngestionWorker());
  } catch (error) {
    console.error("Discovery worker lane failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Worker failed" }, { status: 500 });
  }
}
