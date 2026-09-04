import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { rematchUserRecommendations, REMATCH_DEFAULT_LIMIT, REMATCH_MAX_LIMIT } from "@/lib/discovery/rematch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Bounded, user-initiated refresh of stored fit after a profile, answer, or
 * preference change. The feed itself never recomputes; it reports stale rows
 * and the client calls this once, then reloads.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json().catch(() => ({}));
    const requested = Number(body?.limit);
    const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, REMATCH_MAX_LIMIT) : REMATCH_DEFAULT_LIMIT;
    return NextResponse.json(await rematchUserRecommendations(user.id, { limit }));
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    console.error("Discovery rematch error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to refresh match scores" }, { status });
  }
}
