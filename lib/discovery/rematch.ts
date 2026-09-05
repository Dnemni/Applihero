import { supabaseAdmin } from "@/lib/supabase/client";
import { assessDiscoveryEligibility, getDiscoveryApplicantProfile } from "./eligibility";
import { isQuickFitCurrent, quickFitEquals } from "./fit-cache";
import { applyDiscoveryEligibilityGate, buildQuickFit, MATCHER_VERSION } from "./matcher";
import { getUserProfileContext } from "./repository";
import type { DiscoveryJob, QuickFit } from "./types";

const db = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured");
  return supabaseAdmin as any;
};

export const REMATCH_DEFAULT_LIMIT = 150;
export const REMATCH_MAX_LIMIT = 400;

export type RematchRow = {
  discovery_job_id: string;
  source_id: string;
  fit_score: number | null;
  fit_band: string;
  eligibility_status: string;
  quick_fit: Partial<QuickFit> | null;
  job: DiscoveryJob;
};

export type RematchSummary = {
  userId: string;
  profileHash: string;
  matcherVersion: string;
  candidates: number;
  evaluated: number;
  updated: number;
  remaining: number;
  durationMs: number;
};

/**
 * Picks which stored rows to recompute inside one bounded run. Rows the
 * matcher would treat as current are skipped; the rest are ordered so roles
 * that can appear in Matches (higher stored score) are refreshed first.
 */
export function selectRematchRows(rows: RematchRow[], currency: { matcherVersion: string; profileHash: string }, limit: number) {
  const stale = rows.filter(row => !isQuickFitCurrent(row.quick_fit, { ...currency, jobHash: row.job?.content_hash }));
  stale.sort((left, right) => (right.fit_score ?? -1) - (left.fit_score ?? -1) || left.discovery_job_id.localeCompare(right.discovery_job_id));
  return { selected: stale.slice(0, Math.max(0, limit)), remaining: Math.max(0, stale.length - limit) };
}

export function evaluateRematchRow(row: RematchRow, context: { background: string; profileHash: string; applicant: ReturnType<typeof getDiscoveryApplicantProfile> }) {
  const job = { ...row.job, description: row.job.description || "", parsed_requirements: row.job.parsed_requirements || [] } as DiscoveryJob;
  return applyDiscoveryEligibilityGate({
    ...buildQuickFit(job, context.background),
    matcherVersion: MATCHER_VERSION,
    evaluatedProfileHash: context.profileHash,
    evaluatedJobHash: job.content_hash,
  }, assessDiscoveryEligibility(job as any, context.applicant));
}

/** Canonical display fit used by detail and mutation routes. It never writes. */
export function evaluateDisplayFit(job: DiscoveryJob, context: { background: string; profileHash: string }) {
  return evaluateRematchRow({
    discovery_job_id: job.id,
    source_id: job.source_id,
    fit_score: null,
    fit_band: "needs_information",
    eligibility_status: "unknown",
    quick_fit: null,
    job,
  }, { ...context, applicant: getDiscoveryApplicantProfile(context.background) });
}

const REMATCH_JOB_FIELDS = "id,source_id,source_job_id,company_name,title,description,location,workplace_type,employment_type,departments,source_url,apply_url,source_published_at,source_updated_at,application_deadline,discovered_at,last_verified_at,status,parsed_requirements,parser_version,content_hash";
const STALE_SCAN_ROWS = 1_000;

type NarrowRow = { discovery_job_id: string; source_id: string; fit_score: number | null; fit_band: string; eligibility_status: string; quick_fit: Partial<QuickFit> | null; job: { id: string; content_hash: string } };

function narrowRow(row: any): NarrowRow | null {
  const job = Array.isArray(row.discovery_jobs) ? row.discovery_jobs[0] : row.discovery_jobs;
  if (!job) return null;
  return {
    discovery_job_id: row.discovery_job_id, source_id: row.source_id, fit_score: row.fit_score, fit_band: row.fit_band, eligibility_status: row.eligibility_status,
    quick_fit: {
      matcherVersion: row.evaluated_matcher_version ?? undefined,
      evaluatedProfileHash: row.evaluated_profile_hash ?? undefined,
      evaluatedJobHash: row.evaluated_job_hash ?? undefined,
      discoveryEligible: row.evaluated_gate === "true" ? true : row.evaluated_gate === "false" ? false : undefined,
    },
    job,
  };
}

const NARROW_FIELDS = "discovery_job_id,source_id,fit_score,fit_band,eligibility_status,evaluated_profile_hash:quick_fit->>evaluatedProfileHash,evaluated_matcher_version:quick_fit->>matcherVersion,evaluated_job_hash:quick_fit->>evaluatedJobHash,evaluated_gate:quick_fit->>discoveryEligible,discovery_jobs!inner(id,content_hash)";

/**
 * Recomputes stale fit for one user outside any page load. Staleness that the
 * database can see (profile hash, matcher version, missing gate) is selected
 * there; posting edits are detected from a narrow scan of the least recently
 * evaluated rows. Only the rows chosen for this run are hydrated with their
 * descriptions, and every write goes through the same canonical comparison as
 * the sync worker, so unchanged scores are left untouched.
 */
export async function rematchUserRecommendations(userId: string, options: { limit?: number; jobIds?: string[] } = {}): Promise<RematchSummary> {
  const started = Date.now();
  const limit = Math.max(1, Math.min(options.limit || REMATCH_DEFAULT_LIMIT, REMATCH_MAX_LIMIT));
  const database = db();
  const { background, profileHash } = await getUserProfileContext(userId);
  const currency = { matcherVersion: MATCHER_VERSION, profileHash };
  const staleFilter = `quick_fit->>evaluatedProfileHash.neq.${profileHash},quick_fit->>matcherVersion.neq.${MATCHER_VERSION},quick_fit->>evaluatedProfileHash.is.null,quick_fit->>discoveryEligible.is.null`;

  const requestedJobIds = Array.from(new Set((options.jobIds || []).filter(Boolean))).slice(0, REMATCH_MAX_LIMIT);
  let knownQuery = database.from("user_job_recommendations").select(NARROW_FIELDS)
      .eq("user_id", userId).eq("active", true).eq("discovery_jobs.status", "open").or(staleFilter)
      .order("fit_score", { ascending: false, nullsFirst: false }).order("discovery_job_id").limit(limit);
  let countQuery = database.from("user_job_recommendations").select("discovery_job_id,discovery_jobs!inner(id)", { count: "exact", head: true })
      .eq("user_id", userId).eq("active", true).eq("discovery_jobs.status", "open").or(staleFilter);
  if (requestedJobIds.length) {
    knownQuery = knownQuery.in("discovery_job_id", requestedJobIds);
    countQuery = countQuery.in("discovery_job_id", requestedJobIds);
  }
  const driftQuery = requestedJobIds.length
    ? database.from("user_job_recommendations").select(NARROW_FIELDS).eq("user_id", userId).eq("active", true).eq("discovery_jobs.status", "open").in("discovery_job_id", requestedJobIds)
    : database.from("user_job_recommendations").select(NARROW_FIELDS).eq("user_id", userId).eq("active", true).eq("discovery_jobs.status", "open").order("last_evaluated_at", { ascending: true }).limit(STALE_SCAN_ROWS);
  const [known, knownCount, drift] = await Promise.all([
    knownQuery,
    countQuery,
    driftQuery,
  ]);
  for (const response of [known, knownCount, drift]) if (response.error) throw response.error;
  const candidates = new Map<string, NarrowRow>();
  for (const row of [...(known.data || []), ...(drift.data || [])]) {
    const narrow = narrowRow(row);
    if (narrow && !candidates.has(narrow.discovery_job_id)) candidates.set(narrow.discovery_job_id, narrow);
  }
  const { selected } = selectRematchRows(Array.from(candidates.values()).map(row => ({ ...row, job: row.job as DiscoveryJob })), currency, limit);
  const driftOnly = Array.from(candidates.values()).filter(row => !isQuickFitCurrent(row.quick_fit, { ...currency, jobHash: row.job.content_hash }) && row.quick_fit?.evaluatedProfileHash === profileHash && row.quick_fit?.matcherVersion === MATCHER_VERSION && typeof row.quick_fit?.discoveryEligible === "boolean").length;
  const staleTotal = (knownCount.count || 0) + driftOnly;

  const jobs = new Map<string, DiscoveryJob>();
  const ids = selected.map(row => row.discovery_job_id);
  for (let index = 0; index < ids.length; index += 100) {
    const { data, error } = await database.from("discovery_jobs").select(REMATCH_JOB_FIELDS).in("id", ids.slice(index, index + 100));
    if (error) throw error;
    for (const job of data || []) jobs.set(job.id, job as DiscoveryJob);
  }
  const { data: storedFits, error: storedError } = ids.length
    ? await database.from("user_job_recommendations").select("discovery_job_id,quick_fit").eq("user_id", userId).in("discovery_job_id", ids)
    : { data: [], error: null };
  if (storedError) throw storedError;
  const storedFitById = new Map((storedFits || []).map((row: any) => [row.discovery_job_id, row.quick_fit]));

  const applicant = getDiscoveryApplicantProfile(background);
  const now = new Date().toISOString();
  let evaluated = 0;
  const updates = selected.flatMap(row => {
    const job = jobs.get(row.discovery_job_id);
    if (!job) return [];
    evaluated += 1;
    const quickFit = evaluateRematchRow({ ...row, job }, { background, profileHash, applicant });
    if (quickFitEquals(quickFit, storedFitById.get(row.discovery_job_id))) return [];
    return [{
      user_id: userId,
      source_id: row.source_id,
      discovery_job_id: row.discovery_job_id,
      fit_score: quickFit.score,
      fit_band: quickFit.band,
      eligibility_status: quickFit.eligibility.status,
      quick_fit: quickFit,
      active: true,
      last_evaluated_at: now,
    }];
  });
  for (let index = 0; index < updates.length; index += 50) {
    const { error } = await database.from("user_job_recommendations").upsert(updates.slice(index, index + 50), { onConflict: "user_id,discovery_job_id" });
    if (error) throw error;
  }
  return {
    userId, profileHash, matcherVersion: MATCHER_VERSION,
    candidates: staleTotal, evaluated, updated: updates.length, remaining: Math.max(0, staleTotal - evaluated),
    durationMs: Date.now() - started,
  };
}

/**
 * Finalizer step: walk every subscriber within a time budget so profile,
 * answer, matcher, and posting changes converge without any page load doing
 * the work. Users are visited in a stable order and the budget is generous
 * enough that the hourly cadence keeps up with normal churn.
 */
export async function processDiscoveryRematches(options: { userLimit?: number; perUserLimit?: number; budgetMs?: number } = {}) {
  const started = Date.now();
  const budgetMs = Math.max(5_000, Math.min(options.budgetMs || 60_000, 100_000));
  const userLimit = Math.max(1, Math.min(options.userLimit || 100, 500));
  const perUserLimit = Math.max(1, Math.min(options.perUserLimit || REMATCH_DEFAULT_LIMIT, REMATCH_MAX_LIMIT));
  const { data, error } = await db().from("user_job_source_subscriptions").select("user_id").eq("enabled", true).order("user_id").limit(5_000);
  if (error) throw error;
  const userIds = Array.from(new Set<string>((data || []).map((row: any) => String(row.user_id)))).slice(0, userLimit);
  const summaries: RematchSummary[] = [];
  let skippedForBudget = 0;
  for (const userId of userIds) {
    if (Date.now() - started > budgetMs) { skippedForBudget += 1; continue; }
    try {
      summaries.push(await rematchUserRecommendations(userId, { limit: perUserLimit }));
    } catch (caught) {
      console.error(`Discovery rematch failed for ${userId}:`, caught);
    }
  }
  return {
    users: userIds.length,
    processed: summaries.length,
    skippedForBudget,
    evaluated: summaries.reduce((sum, item) => sum + item.evaluated, 0),
    updated: summaries.reduce((sum, item) => sum + item.updated, 0),
    remaining: summaries.reduce((sum, item) => sum + item.remaining, 0),
    durationMs: Date.now() - started,
  };
}
