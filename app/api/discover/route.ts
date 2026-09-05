import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import {
  DiscoveryQueryTimeoutError, getCatalogDiscoveryJobPage, getUserApplicationStates, getUserLocationPreferenceRows, getUserMatchCandidates,
  getUserMatchCards, getUserProfileContext, getUserSourceIds, hasUserSubscriptions,
} from "@/lib/discovery/repository";
import { MATCHER_VERSION } from "@/lib/discovery/matcher";
import type { DiscoveryFeedResponse, DiscoveryJobCard, QuickFit } from "@/lib/discovery/types";
import { decodeLocationPreferences } from "@/lib/discovery/location";
import { clampFeedLimit, clampFeedOffset, selectMatchPage } from "@/lib/discovery/feed";
import { isQuickFitCurrent, MATCH_MINIMUM_SCORE } from "@/lib/discovery/fit-cache";
import { createRequestTimer } from "@/lib/discovery/timing";

export const dynamic = "force-dynamic";

const CATALOG_FIT: QuickFit = {
  score: null,
  band: "needs_information",
  label: "Not scored",
  reasons: ["All roles is the shared catalog. Open a role to review its fit."],
  supportedCount: 0,
  requirementCount: 0,
  eligibility: { status: "unknown", label: "Not scored", reasons: ["This catalog role has not been matched to your profile."] },
};

/**
 * The feed is a read: stored fit rows are served exactly as the ingestion and
 * rematch workers wrote them. When rows are stale the response says so and the
 * client can request a bounded rematch; nothing is recomputed or written here.
 */
export async function GET(request: NextRequest) {
  const timer = createRequestTimer();
  try {
    const params = request.nextUrl.searchParams;
    const query = params.get("query")?.trim() || "";
    const company = params.get("company")?.trim() || "";
    const location = params.get("location")?.trim() || "";
    const workplace = params.get("workplace")?.trim() || "";
    const rawFreshness = params.get("freshness");
    const freshness = Math.max(0, Number(rawFreshness || 0) || 0);
    const scope = params.get("scope") === "all" ? "all" : "matches";
    const useSavedLocation = params.get("useSavedLocation") === "1";
    const limit = clampFeedLimit(params.get("limit"));
    const offset = clampFeedOffset(params.get("offset"));
    const user = await timer.time("auth", () => requireApiUser(request));

    const [{ hasBackground, profileHash }, hasSubscriptions, sourceIds, locationRows] = await timer.time("profile", () => Promise.all([
      getUserProfileContext(user.id),
      hasUserSubscriptions(user.id),
      getUserSourceIds(user.id),
      getUserLocationPreferenceRows(user.id),
    ]));
    const locationPreferences = decodeLocationPreferences(locationRows);

    let body: DiscoveryFeedResponse;
    if (scope === "matches") {
      // Matches default to the last 30 days of provider publication dates; an
      // explicit freshness=0 asks for every qualifying open role.
      const matchFreshness = rawFreshness === null ? 30 : freshness;
      const candidates = await timer.time("candidates", () => getUserMatchCandidates(user.id, {
        minimumFitScore: MATCH_MINIMUM_SCORE, sourceIds, freshness: matchFreshness, query, company, location, workplace,
      }), result => `${result.rows.length} rows${result.truncated ? " (capped)" : ""}`);
      if (candidates.truncated) console.warn(`Discovery Matches candidate cap reached for user ${user.id}`);
      const page = selectMatchPage(candidates.rows, {
        location: locationPreferences, offset, limit,
        currency: { matcherVersion: MATCHER_VERSION, profileHash },
      });
      const [items, applicationStates] = await timer.time("cards", () => Promise.all([
        getUserMatchCards(user.id, page.ids),
        getUserApplicationStates(user.id, page.ids),
      ]), ([rows]) => `${rows.length} cards`);
      const jobs: DiscoveryJobCard[] = items.map(({ job, quickFit }) => {
        const { description_html: _html, parsed_requirements: _requirements, description: _description, ...card } = job;
        return {
          ...card,
          description: "",
          quickFit,
          fitState: isQuickFitCurrent(quickFit, { matcherVersion: MATCHER_VERSION, profileHash, jobHash: job.content_hash }) ? "current" : "stale",
          application: applicationStates.get(job.id) as DiscoveryJobCard["application"] || null,
        };
      });
      body = {
        jobs, scope, totalResults: page.total, strongResults: page.strong, staleMatches: page.stale,
        offset: page.offset, nextOffset: page.nextOffset, totalIsEstimate: candidates.truncated, hasBackground, hasSubscriptions,
      };
    } else {
      // The catalog is shared and independent of follows. Every filter,
      // including the saved location rule, is applied before paging so totals
      // and "Show more" describe the whole catalog rather than one fetched window.
      const catalogPage = await timer.time("catalog", () => getCatalogDiscoveryJobPage({
        offset, limit, filters: { query, company, location, workplace, freshness },
        location: useSavedLocation ? locationPreferences : { preferredCountry: "", preferredRegions: [], locationScope: "worldwide", includeRemote: true },
      }), result => `${result.items.length} rows${result.locationFilteredInDatabase ? "" : " (fallback)"}`);
      const applicationStates = await timer.time("applications", () => getUserApplicationStates(user.id, catalogPage.items.map(job => job.id)));
      const jobs: DiscoveryJobCard[] = catalogPage.items.map(job => {
        const { description_html: _html, parsed_requirements: _requirements, description: _description, ...card } = job;
        return { ...card, description: "", quickFit: CATALOG_FIT, fitState: "catalog", application: applicationStates.get(job.id) as DiscoveryJobCard["application"] || null };
      });
      body = {
        jobs, scope, totalResults: catalogPage.total, totalIsEstimate: catalogPage.totalIsEstimate, strongResults: 0, staleMatches: 0,
        offset: catalogPage.offset, nextOffset: catalogPage.nextOffset, hasBackground, hasSubscriptions,
      };
    }

    return NextResponse.json(body, {
      // Authenticated, per-user payload: the client keeps a bounded in-memory
      // cache instead of relying on the shared HTTP cache keyed by URL alone.
      headers: { "Cache-Control": "no-store", "Server-Timing": timer.header() },
    });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : error instanceof DiscoveryQueryTimeoutError ? 503 : 500;
    console.error("Discover list error:", error);
    const message = error instanceof DiscoveryQueryTimeoutError
      ? "The catalog is slow right now. Try again in a moment."
      : error instanceof Error ? error.message : "Unable to load jobs";
    return NextResponse.json({ error: message }, { status, headers: { "Server-Timing": timer.header() } });
  }
}
