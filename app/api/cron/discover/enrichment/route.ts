import { NextRequest, NextResponse } from "next/server";
import { hasCronAuthorization } from "@/lib/discovery/cron";
import { drainDiscoveryEnrichment } from "@/lib/discovery/enrichment";
import { boundedInteger } from "@/lib/discovery/ingestion-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!hasCronAuthorization(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await drainDiscoveryEnrichment({
      batchSize: boundedInteger(request.nextUrl.searchParams.get("batchSize"), 4, 8),
      maxItems: boundedInteger(request.nextUrl.searchParams.get("maxItems"), 40, 100),
      budgetMs: boundedInteger(request.nextUrl.searchParams.get("budgetMs"), 45_000, 90_000),
    }));
  } catch (error) {
    console.error("Discovery enrichment worker failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Enrichment worker failed" }, { status: 500 });
  }
}
