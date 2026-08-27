import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { getUserApplicationStates, getUserRecommendedJobPage, hasUserBackground, hasUserSubscriptions } from "@/lib/discovery/repository";
import { getUserBackground, saveRecommendationFit } from "@/lib/discovery/repository";
import { applyDiscoveryEligibilityGate, buildQuickFit, MATCHER_VERSION } from "@/lib/discovery/matcher";
import { hashText } from "@/lib/discovery/parser";
import type { DiscoveryJobCard } from "@/lib/discovery/types";
import { assessDiscoveryEligibility, getDiscoveryApplicantProfile } from "@/lib/discovery/eligibility";

export const dynamic = "force-dynamic";

// The sync stores a wider per-user company catalog so intentional searches can
// explore it. Keep the normal discovery feed focused on roles with a baseline
// fit signal; explicit filters opt into the broader, still non-conflicting set.
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("query")?.trim() || "";
    const company = request.nextUrl.searchParams.get("company")?.trim() || "";
    const location = request.nextUrl.searchParams.get("location")?.trim() || "";
    const workplace = request.nextUrl.searchParams.get("workplace")?.trim() || "";
    const freshness = Number(request.nextUrl.searchParams.get("freshness") || 0);
    const scope = request.nextUrl.searchParams.get("scope") === "all" ? "all" : "matches";
    const resultLimit = Math.max(20, Math.min(200, Number(request.nextUrl.searchParams.get("limit") || 50)));
    const user = await requireApiUser(request);
    const [hasBackground, hasSubscriptions, background, resultPage] = await Promise.all([
      hasUserBackground(user.id),
      hasUserSubscriptions(user.id),
      getUserBackground(user.id),
      getUserRecommendedJobPage(user.id, { limit: resultLimit, scope, query, company, location, workplace, freshness }),
    ]);
    const profileHash = hashText(background);
    const applicantProfile = getDiscoveryApplicantProfile(background);
    const recommendations = resultPage.items.map(item => {
      const stored = item.quickFit;
      const fitIsCurrent =
        stored?.matcherVersion === MATCHER_VERSION &&
        stored.evaluatedProfileHash === profileHash &&
        stored.evaluatedJobHash === item.job.content_hash &&
        typeof stored.discoveryEligible === "boolean";
      const quickFit = fitIsCurrent ? stored : applyDiscoveryEligibilityGate({
        ...buildQuickFit(item.job, background),
        matcherVersion: MATCHER_VERSION,
        evaluatedProfileHash: profileHash,
        evaluatedJobHash: item.job.content_hash,
      }, assessDiscoveryEligibility(item.job as any, applicantProfile));
      return { ...item, quickFit };
    });
    const storedFitByJob = new Map(resultPage.items.map(item => [item.job.id, item.quickFit]));
    const refreshed = recommendations.filter(item => JSON.stringify(item.quickFit) !== JSON.stringify(storedFitByJob.get(item.job.id)));
    if (refreshed.length) await Promise.all(refreshed.map(item => saveRecommendationFit(user.id, item.job.id, item.quickFit)));

    const applicationStates = await getUserApplicationStates(user.id, recommendations.map(item => item.job.id));
    const cards: DiscoveryJobCard[] = recommendations.map(({ job, quickFit }) => {
      const { description_html: _html, parsed_requirements, ...card } = job;
      return {
        ...card,
        description_preview: job.description.slice(0, 240),
        quickFit,
        application: applicationStates.get(job.id) as DiscoveryJobCard["application"] || null,
      };
    });

    return NextResponse.json({
      jobs: cards,
      totalResults: resultPage.total,
      strongResults: resultPage.strong,
      hasBackground,
      hasSubscriptions,
    }, {
      // A brief browser-only cache window prevents repeated identical list
      // reads during navigation. The shared source catalog is refreshed in
      // the background, and `private` keeps this authenticated payload local.
      headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=60" },
    });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    console.error("Discover list error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load jobs" }, { status });
  }
}
