import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { getCatalogDiscoveryJobs, getUserApplicationStates, hasUserBackground, hasUserSubscriptions } from "@/lib/discovery/repository";
import { getUserBackground } from "@/lib/discovery/repository";
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
    const freshness = Number(request.nextUrl.searchParams.get("freshness") || 0);
    const scope = request.nextUrl.searchParams.get("scope") === "all" ? "all" : "matches";
    const resultLimit = Math.max(20, Math.min(200, Number(request.nextUrl.searchParams.get("limit") || 50)));
    const user = await requireApiUser(request);
    const [hasBackground, hasSubscriptions, background, catalogJobs, locationRows] = await Promise.all([
      hasUserBackground(user.id),
      hasUserSubscriptions(user.id),
      getUserBackground(user.id),
      getCatalogDiscoveryJobs({ limit: resultLimit, query, company, location, workplace, freshness }),
      db().from("user_discovery_answers").select("question_key, normalized_value").eq("user_id", user.id).in("question_key", LOCATION_KEYS),
    ]);
    if (locationRows.error) throw locationRows.error;
    const locationPreferences = decodeLocationPreferences(locationRows.data || []);
    const profileHash = hashText(background);
    const applicantProfile = getDiscoveryApplicantProfile(background);
    const recommendations = catalogJobs
      .filter(job => matchesDiscoveryLocation(job, locationPreferences))
      .map(job => {
      const quickFit = applyDiscoveryEligibilityGate({
        ...buildQuickFit(job, background),
        matcherVersion: MATCHER_VERSION,
        evaluatedProfileHash: profileHash,
        evaluatedJobHash: job.content_hash,
      }, assessDiscoveryEligibility(job as any, applicantProfile));
      return { job, quickFit };
    });
    const visibleRecommendations = scope === "matches"
      ? recommendations.filter(item => item.quickFit.score !== null && item.quickFit.score > 0 && item.quickFit.band !== "likely_conflict" && item.quickFit.eligibility.status !== "conflict")
      : recommendations;

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
      totalResults: visibleRecommendations.length,
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
