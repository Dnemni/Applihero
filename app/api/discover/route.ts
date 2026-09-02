import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { getCatalogDiscoveryJobs, getUserApplicationStates, getUserRecommendedJobPage, getUserSourceIds, hasUserBackground, hasUserSubscriptions } from "@/lib/discovery/repository";
import { getUserBackground, saveRecommendationFit } from "@/lib/discovery/repository";
import { applyDiscoveryEligibilityGate, buildQuickFit, MATCHER_VERSION } from "@/lib/discovery/matcher";
import { hashText } from "@/lib/discovery/parser";
import type { DiscoveryJobCard } from "@/lib/discovery/types";
import { assessDiscoveryEligibility, getDiscoveryApplicantProfile } from "@/lib/discovery/eligibility";
import { matchesDiscoveryLocation, type DiscoveryLocationPreferences } from "@/lib/discovery/location";
import { supabaseAdmin } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

const db = () => supabaseAdmin as any;
const LOCATION_KEYS = ["preference_country", "preference_regions", "preference_remote", "preference_location_scope"];

function decodeLocationPreferences(rows: any[]): DiscoveryLocationPreferences {
  const values = new Map(rows.map(row => [row.question_key, row.normalized_value]));
  const scope = String(values.get("preference_location_scope") || "country");
  return {
    preferredCountry: String(values.get("preference_country") || ""),
    preferredRegions: String(values.get("preference_regions") || "").split(",").filter(Boolean).map(decodeURIComponent),
    locationScope: scope === "regions" || scope === "worldwide" ? scope : "country",
    includeRemote: values.get("preference_remote") !== "no",
  };
}

// The sync stores a wider per-user company catalog so intentional searches can
// explore it. Keep the normal discovery feed focused on roles with a baseline
// fit signal; explicit filters opt into the broader, still non-conflicting set.
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("query")?.trim() || "";
    const company = request.nextUrl.searchParams.get("company")?.trim() || "";
    const location = request.nextUrl.searchParams.get("location")?.trim() || "";
    const workplace = request.nextUrl.searchParams.get("workplace")?.trim() || "";
    const rawFreshness = request.nextUrl.searchParams.get("freshness");
    const freshness = Number(rawFreshness || 0);
    const scope = request.nextUrl.searchParams.get("scope") === "all" ? "all" : "matches";
    const resultLimit = Math.max(20, Math.min(200, Number(request.nextUrl.searchParams.get("limit") || 50)));
    const user = await requireApiUser(request);
    const [hasBackground, hasSubscriptions, background, sourceIds, locationRows] = await Promise.all([
      hasUserBackground(user.id),
      hasUserSubscriptions(user.id),
      getUserBackground(user.id),
      getUserSourceIds(user.id),
      db().from("user_discovery_answers").select("question_key, normalized_value").eq("user_id", user.id).in("question_key", LOCATION_KEYS),
    ]);
    if (locationRows.error) throw locationRows.error;
    const locationPreferences = decodeLocationPreferences(locationRows.data || []);
    const matchFreshness = rawFreshness === null ? 30 : freshness;
    const resultPage = scope === "matches"
      ? await getUserRecommendedJobPage(user.id, { limit: Math.min(200, resultLimit * 3), scope, sourceIds, minimumFitScore: 50, query, company, location, workplace, freshness: matchFreshness })
      : null;
    const catalogJobs = scope === "all"
      ? await getCatalogDiscoveryJobs({ limit: resultLimit, query, company, location, workplace, freshness })
      : [];
    const profileHash = hashText(background);
    const applicantProfile = getDiscoveryApplicantProfile(background);
    const recommendations = (resultPage?.items || []).map(item => {
      const stored = item.quickFit;
      const fitIsCurrent = stored?.matcherVersion === MATCHER_VERSION && stored.evaluatedProfileHash === profileHash && stored.evaluatedJobHash === item.job.content_hash && typeof stored.discoveryEligible === "boolean";
      const quickFit = fitIsCurrent ? stored : applyDiscoveryEligibilityGate({
        ...buildQuickFit(item.job, background), matcherVersion: MATCHER_VERSION, evaluatedProfileHash: profileHash, evaluatedJobHash: item.job.content_hash,
      }, assessDiscoveryEligibility(item.job as any, applicantProfile));
      return { ...item, quickFit };
    });
    const storedFitByJob = new Map((resultPage?.items || []).map(item => [item.job.id, item.quickFit]));
    const refreshed = recommendations.filter(item => JSON.stringify(item.quickFit) !== JSON.stringify(storedFitByJob.get(item.job.id)));
    if (refreshed.length) await Promise.all(refreshed.map(item => saveRecommendationFit(user.id, item.job.id, item.quickFit)));
    const neutralFit = { score: null, band: "needs_information" as const, label: "Not evaluated", reasons: ["All roles is a catalog view. Open a role to review its fit."], supportedCount: 0, requirementCount: 0, eligibility: { status: "unknown" as const, label: "Not evaluated", reasons: ["This catalog role has not been matched to your profile."] } };
    const visibleRecommendations = scope === "matches"
      ? recommendations.filter(item => matchesDiscoveryLocation(item.job, locationPreferences)).slice(0, resultLimit)
      : catalogJobs.filter(job => matchesDiscoveryLocation(job, locationPreferences)).map(job => ({ job, quickFit: neutralFit }));

    const applicationStates = await getUserApplicationStates(user.id, visibleRecommendations.map(item => item.job.id));
    const cards: DiscoveryJobCard[] = visibleRecommendations.map(({ job, quickFit }) => {
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
      totalResults: scope === "matches" ? visibleRecommendations.length : catalogJobs.length,
      strongResults: visibleRecommendations.filter(item => item.quickFit.score !== null && item.quickFit.score >= 75 && item.quickFit.band !== "likely_conflict" && item.quickFit.eligibility.status !== "conflict").length,
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
