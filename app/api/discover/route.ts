import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { getUserApplicationStates, getUserRecommendedJobs, hasUserBackground, hasUserSubscriptions } from "@/lib/discovery/repository";
import { getUserBackground, saveRecommendationFit } from "@/lib/discovery/repository";
import { buildQuickFit, MATCHER_VERSION } from "@/lib/discovery/matcher";
import { hashText } from "@/lib/discovery/parser";
import type { DiscoveryJobCard } from "@/lib/discovery/types";
import { assessDiscoveryEligibility, getDiscoveryApplicantProfile } from "@/lib/discovery/eligibility";

export const dynamic = "force-dynamic";

function includes(value: string | null | undefined, query: string) {
  return (value || "").toLowerCase().includes(query.toLowerCase());
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const [hasBackground, hasSubscriptions, background, storedRecommendations] = await Promise.all([
      hasUserBackground(user.id),
      hasUserSubscriptions(user.id),
      getUserBackground(user.id),
      getUserRecommendedJobs(user.id),
    ]);
    const profileHash = hashText(background);
    const applicantProfile = getDiscoveryApplicantProfile(background);
    const recommendations = storedRecommendations.filter(item => assessDiscoveryEligibility(item.job as any, applicantProfile).eligible).map(item => {
      const stored = item.quickFit;
      const analysisIsCurrent = stored?.source === "analysis" &&
        stored.matcherVersion === MATCHER_VERSION &&
        stored.evaluatedProfileHash === profileHash &&
        stored.evaluatedJobHash === item.job.content_hash;
      return { ...item, quickFit: analysisIsCurrent ? stored : buildQuickFit(item.job, background) };
    });
    const storedFitByJob = new Map(storedRecommendations.map(item => [item.job.id, item.quickFit]));
    const refreshed = recommendations.filter(item => JSON.stringify(item.quickFit) !== JSON.stringify(storedFitByJob.get(item.job.id)));
    if (refreshed.length) await Promise.all(refreshed.map(item => saveRecommendationFit(user.id, item.job.id, item.quickFit)));

    const query = request.nextUrl.searchParams.get("query")?.trim() || "";
    const company = request.nextUrl.searchParams.get("company")?.trim() || "";
    const location = request.nextUrl.searchParams.get("location")?.trim() || "";
    const workplace = request.nextUrl.searchParams.get("workplace")?.trim() || "";
    const freshness = Number(request.nextUrl.searchParams.get("freshness") || 0);
    const cutoff = freshness > 0 ? Date.now() - freshness * 24 * 60 * 60 * 1000 : 0;

    const filtered = recommendations.filter(({ job, quickFit }) => {
      // Discovery's open-role list is deliberately actionable: a role needs a
      // positive score and must not have an identified hard eligibility conflict.
      if (quickFit.score <= 0 || quickFit.band === "likely_conflict" || quickFit.eligibility.status === "conflict") return false;
      if (query && !includes(job.title, query) && !includes(job.company_name, query) && !includes(job.description, query)) return false;
      if (company && !includes(job.company_name, company)) return false;
      if (location && !includes(job.location, location)) return false;
      if (workplace && job.workplace_type !== workplace) return false;
      if (cutoff && new Date(job.source_published_at || job.discovered_at).getTime() < cutoff) return false;
      return true;
    });

    const applicationStates = await getUserApplicationStates(user.id, filtered.map(item => item.job.id));
    const cards: DiscoveryJobCard[] = filtered.map(({ job, quickFit }) => {
      const { description_html: _html, parsed_requirements, ...card } = job;
      return {
        ...card,
        description_preview: job.description.slice(0, 240),
        quickFit,
        application: applicationStates.get(job.id) as DiscoveryJobCard["application"] || null,
      };
    });

    return NextResponse.json({ jobs: cards, hasBackground, hasSubscriptions });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    console.error("Discover list error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load jobs" }, { status });
  }
}
