import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { getCachedMatch, getDiscoveryJob, getUserApplicationState, getUserBackground, getUserRecommendationFit, hasUserBackground } from "@/lib/discovery/repository";
import { MATCHER_VERSION } from "@/lib/discovery/matcher";
import { hashText } from "@/lib/discovery/parser";
import { isQuickFitCurrent } from "@/lib/discovery/fit-cache";
import { evaluateDisplayFit } from "@/lib/discovery/rematch";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser(request);
    const [job, recommendation, hasBackground, background, application] = await Promise.all([
      getDiscoveryJob(params.id, { ensureParsing: false }),
      getUserRecommendationFit(user.id, params.id),
      hasUserBackground(user.id),
      getUserBackground(user.id, params.id),
      getUserApplicationState(user.id, params.id),
    ]);
    if (!job || (job.status === "closed" && !application)) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const profileHash = hashText(background);
    const stored = recommendation?.quick_fit;
    const fitIsCurrent = isQuickFitCurrent(stored, { matcherVersion: MATCHER_VERSION, profileHash, jobHash: job.content_hash });
    const quickFit = fitIsCurrent ? stored : evaluateDisplayFit(job, { background, profileHash });
    const analysis = await getCachedMatch({
      userId: user.id,
      jobId: job.id,
      profileHash,
      jobHash: job.content_hash,
      matcherVersion: MATCHER_VERSION,
    });

    return NextResponse.json({
      job,
      quickFit,
      analysis,
      hasBackground,
      application,
      fitState: recommendation ? fitIsCurrent ? "current" : "stale" : "catalog",
      hasRecommendation: Boolean(recommendation),
      recommendationActive: recommendation?.active === true,
    });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    console.error("Discover detail error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load job" }, { status });
  }
}
