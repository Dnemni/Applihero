import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { syncDueSources } from "@/lib/discovery/sync";
import { processDiscoveryEnrichment } from "@/lib/discovery/enrichment";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const INTERACTIVE_SOURCE_LIMIT = 6;

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json().catch(() => ({}));
    const sourceId = typeof body.sourceId === "string" ? body.sourceId : undefined;
    const sourceIds = Array.isArray(body.sourceIds)
      ? Array.from(new Set(body.sourceIds.filter((id: unknown): id is string => typeof id === "string"))).slice(0, INTERACTIVE_SOURCE_LIMIT)
      : [];
    const requestedSourceIds = sourceId ? [sourceId] : sourceIds;
    const background = body.background === true;
    const startedAt = Date.now();
    const force = requestedSourceIds.length > 0 || body.force === true;
    const results = await syncDueSources({
      force,
      limit: requestedSourceIds.length || INTERACTIVE_SOURCE_LIMIT,
      sourceIds: requestedSourceIds,
      userId: user.id,
    });
    const enrichment = await processDiscoveryEnrichment(requestedSourceIds.length ? 8 : 4);
    return NextResponse.json({
      synced: results.reduce((sum, result) => sum + result.verified, 0),
      discovered: results.reduce((sum, result) => sum + result.discovered, 0),
      sources: results.length,
      failures: results.filter(result => result.error),
      results,
      enrichment,
      durationMs: Date.now() - startedAt,
      sourceDurationMs: results.reduce((sum, result) => sum + result.durationMs, 0),
      requestedSources: requestedSourceIds.length,
      message: results.length ? undefined : background ? "All followed companies are already within their hourly freshness window." : "No enabled company sources are configured.",
    });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    console.error("Discovery sync error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to sync jobs" }, { status });
  }
}
