import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { syncDueSources } from "@/lib/discovery/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const INTERACTIVE_SOURCE_LIMIT = 36;

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json().catch(() => ({}));
    const sourceId = typeof body.sourceId === "string" ? body.sourceId : undefined;
    const startedAt = Date.now();
    const results = await syncDueSources({ force: true, limit: sourceId ? 1 : INTERACTIVE_SOURCE_LIMIT, sourceId, userId: user.id });
    return NextResponse.json({
      synced: results.reduce((sum, result) => sum + result.verified, 0),
      discovered: results.reduce((sum, result) => sum + result.discovered, 0),
      sources: results.length,
      failures: results.filter(result => result.error),
      results,
      durationMs: Date.now() - startedAt,
      sourceDurationMs: results.reduce((sum, result) => sum + result.durationMs, 0),
      message: results.length ? undefined : "No enabled company sources are configured.",
    });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    console.error("Discovery sync error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to sync jobs" }, { status });
  }
}
