import { NextRequest, NextResponse } from "next/server";
import { hasCronAuthorization } from "@/lib/discovery/cron";
import { boundedInteger, drainDiscoveryIngestionWorker, runDiscoveryIngestionWorker } from "@/lib/discovery/ingestion-queue";

export const dynamic = "force-dynamic";
// Each invocation owns at most three source scans and has a four-minute DB
// lease, leaving time for Vercel to end the request without losing the task.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!hasCronAuthorization(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (request.nextUrl.searchParams.get("drain") === "1") {
      return NextResponse.json(await drainDiscoveryIngestionWorker({
        maxTasks: boundedInteger(request.nextUrl.searchParams.get("maxTasks"), 34, 40),
      }));
    }
    const limit = boundedInteger(request.nextUrl.searchParams.get("limit"), 2, 3);
    return NextResponse.json(await runDiscoveryIngestionWorker(limit));
  } catch (error) {
    console.error("Discovery worker failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Worker failed" }, { status: 500 });
  }
}
