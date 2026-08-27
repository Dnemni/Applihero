import { NextRequest, NextResponse } from "next/server";
import { syncCatalogSources } from "@/lib/discovery/sync";
import { sendDueDiscoveryDigests } from "@/lib/discovery/digests";
import { processDiscoveryEnrichment } from "@/lib/discovery/enrichment";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const shards = Math.min(8, positiveInteger(request.nextUrl.searchParams.get("shards"), 1));
    const shard = positiveInteger(request.nextUrl.searchParams.get("shard"), 0);
    if (shard >= shards) return NextResponse.json({ error: "Invalid catalog sync shard" }, { status: 400 });
    const results = await syncCatalogSources({ shard, shards });
    // These operations are global. Run them from only one shard so an hourly
    // sweep cannot emit duplicate emails or contend for enrichment rows.
    const maintenance = shard === 0;
    const enrichment = maintenance ? await processDiscoveryEnrichment(24) : null;
    const digests = maintenance ? await sendDueDiscoveryDigests() : null;
    return NextResponse.json({ scanned: results.length, shard, shards, results, enrichment, digests });
  } catch (error) {
    console.error("Scheduled discovery scan failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scan failed" }, { status: 500 });
  }
}
