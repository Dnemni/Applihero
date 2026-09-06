import { NextRequest, NextResponse } from "next/server";
import { hasCronAuthorization } from "@/lib/discovery/cron";
import { sendDueDiscoveryDigests } from "@/lib/discovery/digests";
import { boundedInteger } from "@/lib/discovery/ingestion-queue";
import { processDiscoveryRematches } from "@/lib/discovery/rematch";
import { supabaseAdmin } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!hasCronAuthorization(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const digestLimit = boundedInteger(request.nextUrl.searchParams.get("digestLimit"), 25, 50);
    // This route is deliberately independent of a source worker. Both queues
    // have their own leases and safe retries, so it can run concurrently or in
    // the next hourly trigger when a long scan is still draining.
    const rematchBudgetMs = boundedInteger(request.nextUrl.searchParams.get("rematchBudgetMs"), 45_000, 90_000);
    const rematchUserLimit = boundedInteger(request.nextUrl.searchParams.get("rematchUserLimit"), 20, 100);
    const rematchPerUserLimit = boundedInteger(request.nextUrl.searchParams.get("rematchPerUserLimit"), 250, 400);
    const database = supabaseAdmin as any;
    const [taskReconciliation, enrichmentReconciliation, digests, rematch] = await Promise.all([
      database.rpc("reconcile_discovery_ingestion_tasks"),
      database.rpc("reconcile_discovery_enrichment_queue"),
      sendDueDiscoveryDigests(digestLimit),
      // Stored fit converges here, never during a page load: profile, answer,
      // matcher-version, and posting changes are recomputed in bounded batches.
      processDiscoveryRematches({ budgetMs: rematchBudgetMs, userLimit: rematchUserLimit, perUserLimit: rematchPerUserLimit }),
    ]);
    for (const result of [taskReconciliation, enrichmentReconciliation]) {
      if (result.error && result.error.code !== "PGRST202" && result.error.code !== "42883") throw result.error;
    }
    return NextResponse.json({
      reconciliation: {
        ingestionTasks: taskReconciliation.error ? null : Number(taskReconciliation.data || 0),
        enrichment: enrichmentReconciliation.error ? null : (Array.isArray(enrichmentReconciliation.data) ? enrichmentReconciliation.data[0] : enrichmentReconciliation.data),
      },
      enrichment: { separateWorker: true },
      digests,
      rematch,
    });
  } catch (error) {
    console.error("Discovery finalizer failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Finalizer failed" }, { status: 500 });
  }
}
