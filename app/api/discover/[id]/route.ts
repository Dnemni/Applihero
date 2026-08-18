import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { getCachedMatch, getUserApplicationState, getUserBackground, getUserRecommendedJob, hasUserBackground, saveRecommendationFit } from "@/lib/discovery/repository";
import { buildQuickFit, MATCHER_VERSION } from "@/lib/discovery/matcher";
import { hashText } from "@/lib/discovery/parser";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser(request);
    const [recommendation, hasBackground, background] = await Promise.all([
      getUserRecommendedJob(user.id, params.id),
      hasUserBackground(user.id),
      getUserBackground(user.id, params.id),
    ]);
    if (!recommendation) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const profileHash = hashText(background);
    const stored = recommendation.quickFit;
    const analysisIsCurrent = stored?.source === "analysis" &&
      stored.matcherVersion === MATCHER_VERSION &&
      stored.evaluatedProfileHash === profileHash &&
      stored.evaluatedJobHash === recommendation.job.content_hash;
    // Preserve a completed semantic analysis while its inputs are current.
    // Resume edits, posting edits, or expired answers change a hash and trigger
    // an immediate deterministic refresh until the next detailed analysis.
    const quickFit = analysisIsCurrent ? stored : buildQuickFit(recommendation.job, background);
    if (JSON.stringify(quickFit) !== JSON.stringify(recommendation.quickFit)) await saveRecommendationFit(user.id, params.id, quickFit);
    const analysis = analysisIsCurrent ? await getCachedMatch({
      userId: user.id,
      jobId: recommendation.job.id,
      profileHash,
      jobHash: recommendation.job.content_hash,
      matcherVersion: MATCHER_VERSION,
    }) : null;

    const application = await getUserApplicationState(user.id, recommendation.job.id);
    return NextResponse.json({
      job: recommendation.job,
      quickFit,
      analysis,
      hasBackground,
      application,
    });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    console.error("Discover detail error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load job" }, { status });
  }
}
