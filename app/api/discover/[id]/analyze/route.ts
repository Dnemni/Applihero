import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { analyzeJobFit, MATCHER_VERSION, quickFitFromAnalysis } from "@/lib/discovery/matcher";
import { hashText } from "@/lib/discovery/parser";
import { getCachedMatch, getDiscoveryJob, getUserBackground, saveMatch, saveRecommendationFit } from "@/lib/discovery/repository";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser(request);
    const [job, background] = await Promise.all([
      getDiscoveryJob(params.id),
      getUserBackground(user.id, params.id),
    ]);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const profileHash = hashText(background);
    const cached = await getCachedMatch({
      userId: user.id,
      jobId: job.id,
      profileHash,
      jobHash: job.content_hash,
      matcherVersion: MATCHER_VERSION,
    });
    if (cached) {
      const quickFit = quickFitFromAnalysis(cached, profileHash, job.content_hash);
      await saveRecommendationFit(user.id, job.id, quickFit);
      return NextResponse.json({ analysis: cached, quickFit, cached: true });
    }

    const analysis = await analyzeJobFit(job, background);
    await saveMatch({
      userId: user.id,
      jobId: job.id,
      profileHash,
      jobHash: job.content_hash,
      matcherVersion: MATCHER_VERSION,
      result: analysis,
    });
    const quickFit = quickFitFromAnalysis(analysis, profileHash, job.content_hash);
    await saveRecommendationFit(user.id, job.id, quickFit);
    return NextResponse.json({ analysis, quickFit, cached: false });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    console.error("Discover analysis error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to analyze job" }, { status });
  }
}
