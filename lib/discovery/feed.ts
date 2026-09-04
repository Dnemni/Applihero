import { isQuickFitCurrent, isStrongMatch, qualifiesAsMatch } from "./fit-cache";
import { matchesDiscoveryLocation, type DiscoveryLocationPreferences } from "./location";

/** Narrow row returned by the candidate query: enough to filter, sort, and count without card payloads. */
export type MatchCandidate = {
  discovery_job_id: string;
  source_id: string;
  fit_score: number | null;
  fit_band: string;
  eligibility_status: string;
  evaluated_profile_hash?: string | null;
  evaluated_matcher_version?: string | null;
  evaluated_job_hash?: string | null;
  job: {
    id: string;
    source_published_at: string | null;
    discovered_at?: string | null;
    location: string | null;
    workplace_type: string | null;
    content_hash?: string | null;
  };
};

export type MatchPageSelection = {
  ids: string[];
  total: number;
  strong: number;
  stale: number;
  offset: number;
  nextOffset: number | null;
};

export function clampFeedOffset(value: string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function clampFeedLimit(value: string | null | undefined, fallback = 50) {
  const parsed = Number(value || fallback);
  return Number.isFinite(parsed) ? Math.max(10, Math.min(100, Math.floor(parsed))) : fallback;
}

/**
 * Applies the rules the database cannot express (followed-source membership
 * when passed, strict saved location) to an already sorted candidate list, then
 * selects one page. The total counts every qualifying row, not the visible
 * slice, so a client can page through all of them.
 */
export function selectMatchPage(candidates: MatchCandidate[], options: {
  sourceIds?: Set<string> | null;
  location: DiscoveryLocationPreferences;
  offset: number;
  limit: number;
  currency: { matcherVersion: string; profileHash: string };
}): MatchPageSelection {
  const visible = candidates.filter(candidate =>
    (!options.sourceIds || options.sourceIds.has(candidate.source_id)) &&
    qualifiesAsMatch(candidate) &&
    matchesDiscoveryLocation(candidate.job, options.location));
  const stale = visible.filter(candidate => !isQuickFitCurrent({
    matcherVersion: candidate.evaluated_matcher_version || undefined,
    evaluatedProfileHash: candidate.evaluated_profile_hash || undefined,
    evaluatedJobHash: candidate.evaluated_job_hash || undefined,
    discoveryEligible: true,
  }, { ...options.currency, jobHash: candidate.job.content_hash })).length;
  const offset = Math.min(options.offset, visible.length);
  const page = visible.slice(offset, offset + options.limit);
  const nextOffset = offset + page.length;
  return {
    ids: page.map(candidate => candidate.discovery_job_id),
    total: visible.length,
    strong: visible.filter(isStrongMatch).length,
    stale,
    offset,
    nextOffset: nextOffset < visible.length ? nextOffset : null,
  };
}

/** Sort helper shared by the fallback paths: provider date first, unknown dates last, then stable id. */
export function comparePublishedDesc(left: { source_published_at: string | null; id: string }, right: { source_published_at: string | null; id: string }) {
  const leftTime = left.source_published_at ? Date.parse(left.source_published_at) : Number.NEGATIVE_INFINITY;
  const rightTime = right.source_published_at ? Date.parse(right.source_published_at) : Number.NEGATIVE_INFINITY;
  if (leftTime !== rightTime) return rightTime - leftTime;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
