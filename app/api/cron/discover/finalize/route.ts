import { NextRequest, NextResponse } from "next/server";
import { hasCronAuthorization } from "@/lib/discovery/cron";
import { processDiscoveryEnrichment } from "@/lib/discovery/enrichment";
import { sendDueDiscoveryDigests } from "@/lib/discovery/digests";
import { boundedInteger } from "@/lib/discovery/ingestion-queue";
import { processDiscoveryRematches } from "@/lib/discovery/rematch";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!hasCronAuthorization(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const enrichmentLimit = boundedInteger(request.nextUrl.searchParams.get("enrichmentLimit"), 12, 24);
    const digestLimit = boundedInteger(request.nextUrl.searchParams.get("digestLimit"), 25, 50);
    // This route is deliberately independent of a source worker. Both queues
    // have their own leases and safe retries, so it can run concurrently or in
    // the next hourly trigger when a long scan is still draining.
    const rematchBudgetMs = boundedInteger(request.nextUrl.searchParams.get("rematchBudgetMs"), 45_000, 90_000);
    const [enrichment, digests, rematch] = await Promise.all([
      processDiscoveryEnrichment(enrichmentLimit),
      sendDueDiscoveryDigests(digestLimit),
      // Stored fit converges here, never during a page load: profile, answer,
      // matcher-version, and posting changes are recomputed in bounded batches.
      processDiscoveryRematches({ budgetMs: rematchBudgetMs, perUserLimit: 250 }),
    ]);
    return NextResponse.json({ enrichment, digests, rematch });
  } catch (error) {
    console.error("Discovery finalizer failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Finalizer failed" }, { status: 500 });
  }
}
