import { supabaseAdmin } from "@/lib/supabase/client";
import type { DiscoveryJob } from "./types";
import { answersToMatchingContext, type DiscoveryAnswer } from "./facts";
import { hashText, parseJobRequirements, REQUIREMENTS_PARSER_VERSION } from "./parser";

const db = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured");
  return supabaseAdmin as any;
};

async function ensureCurrentParsing(job: DiscoveryJob): Promise<DiscoveryJob> {
  if (job.parser_version === REQUIREMENTS_PARSER_VERSION) return job;
  const parsedRequirements = parseJobRequirements(job.description || "");
  const contentHash = hashText(JSON.stringify({
    title: job.title,
    description: job.description || "",
    location: job.location,
    updatedAt: job.source_updated_at,
    parserVersion: REQUIREMENTS_PARSER_VERSION,
  }));
  const { error } = await db().from("discovery_jobs").update({
    parsed_requirements: parsedRequirements,
    parser_version: REQUIREMENTS_PARSER_VERSION,
    content_hash: contentHash,
  }).eq("id", job.id);
  if (error) throw error;
  return { ...job, parsed_requirements: parsedRequirements, parser_version: REQUIREMENTS_PARSER_VERSION, content_hash: contentHash };
}

export async function getDiscoveryJob(id: string, options: { ensureParsing?: boolean } = {}): Promise<DiscoveryJob | null> {
  const { data, error } = await db()
    .from("discovery_jobs")
    .select("*, job_sources(provider, company_name, external_key)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return options.ensureParsing === false ? data as DiscoveryJob : ensureCurrentParsing(data as DiscoveryJob);
}

export async function getUserDiscoveryAnswers(userId: string, jobId?: string): Promise<DiscoveryAnswer[]> {
  let query = db().from("user_discovery_answers").select("*").eq("user_id", userId).order("provided_at", { ascending: false });
  if (jobId) query = query.or(`reuse_approved.eq.true,source_job_id.eq.${jobId}`);
  else query = query.eq("reuse_approved", true);
  const { data, error } = await query;
  if (error && (error.code === "42P01" || error.code === "PGRST205")) return [];
  if (error) throw error;
  return (data || []) as DiscoveryAnswer[];
}

export async function getUserBackground(userId: string, jobId?: string): Promise<string> {
  const { data, error } = await db()
    .from("profiles")
    .select("resume_text, transcript_text, bio")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const answers = await getUserDiscoveryAnswers(userId, jobId);
  return [data?.resume_text, data?.transcript_text, data?.bio, answersToMatchingContext(answers)].filter(Boolean).join("\n\n");
}

/**
 * Loads everything the feed needs to know about the applicant in two parallel
 * round trips: whether any background exists, the matching text, and the hash
 * that stored fit rows are validated against.
 */
export async function getUserProfileContext(userId: string): Promise<{ hasBackground: boolean; background: string; profileHash: string }> {
  const [{ data: profile, error }, answers] = await Promise.all([
    db().from("profiles").select("resume_text, transcript_text, bio").eq("id", userId).maybeSingle(),
    getUserDiscoveryAnswers(userId),
  ]);
  if (error) throw error;
  const background = [profile?.resume_text, profile?.transcript_text, profile?.bio, answersToMatchingContext(answers)].filter(Boolean).join("\n\n");
  return {
    hasBackground: Boolean(profile?.resume_text || profile?.transcript_text || profile?.bio),
    background,
    profileHash: hashText(background),
  };
}

export async function hasUserBackground(userId: string): Promise<boolean> {
  const { data, error } = await db()
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .or("resume_text.not.is.null,transcript_text.not.is.null,bio.not.is.null")
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

export async function hasUserSubscriptions(userId: string): Promise<boolean> {
  const { data, error } = await db().from("user_job_source_subscriptions")
    .select("id").eq("user_id", userId).eq("enabled", true).limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

export async function getOpenDiscoveryJobs(limit = 200, sourceIds?: string[]): Promise<DiscoveryJob[]> {
  let query = db()
    .from("discovery_jobs")
    .select("*, job_sources(provider, company_name, external_key)")
    .neq("status", "closed")
    .order("discovered_at", { ascending: false })
    .limit(limit);
  if (sourceIds?.length) query = query.in("source_id", sourceIds);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as DiscoveryJob[];
}

export async function getCatalogDiscoveryJobs(options: {
  limit: number;
  query?: string;
  company?: string;
  location?: string;
  workplace?: string;
  freshness?: number;
}): Promise<{ items: DiscoveryJob[]; total: number }> {
  const safeTerm = (value: string) => value.replace(/[(),.%]/g, " ").trim();
  let query = db().from("discovery_jobs")
    .select("*, job_sources(provider, company_name, external_key)", { count: "exact" })
    .eq("status", "open")
    .order("source_published_at", { ascending: false, nullsFirst: false })
    .order("discovered_at", { ascending: false })
    .limit(Math.max(20, Math.min(options.limit, 500)));
  const search = safeTerm(options.query || "");
  if (search) query = query.or(`title.ilike.%${search}%,company_name.ilike.%${search}%,description.ilike.%${search}%`);
  if (options.company) query = query.ilike("company_name", `%${safeTerm(options.company)}%`);
  if (options.location) query = query.ilike("location", `%${safeTerm(options.location)}%`);
  if (options.workplace) query = query.eq("workplace_type", options.workplace);
  if (options.freshness && options.freshness > 0) query = query.gte("source_published_at", new Date(Date.now() - options.freshness * 86_400_000).toISOString());
  const { data, error, count } = await query;
  if (error) throw error;
  return { items: (data || []) as DiscoveryJob[], total: count || 0 };
}

export async function getDiscoverySourceRecommendationCandidates(limit = 120): Promise<DiscoveryJob[]> {
  const { data, error } = await db()
    .from("discovery_jobs")
    .select("id, source_id, source_job_id, company_name, title, location, workplace_type, employment_type, source_published_at, parsed_requirements, parser_version, content_hash")
    .neq("status", "closed")
    .order("source_published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((job: any) => ({
    ...job,
    description: "",
    description_html: null,
    departments: [],
    source_url: "",
    apply_url: "",
    source_updated_at: null,
    application_deadline: null,
    discovered_at: job.source_published_at || new Date(0).toISOString(),
    last_verified_at: job.source_published_at || new Date(0).toISOString(),
    status: "open",
  })) as DiscoveryJob[];
}

export async function getUserRecommendedJobs(userId: string, limit = 1_000, options: { includeDescription?: boolean } = {}): Promise<Array<{ job: DiscoveryJob; quickFit: any }>> {
  const rows: any[] = [];
  const pageSize = 500;
  const jobFields = [
    "id", "source_id", "source_job_id", "company_name", "title",
    ...(options.includeDescription ? ["description"] : []),
    "location", "workplace_type", "employment_type", "departments", "source_url", "apply_url",
    "source_published_at", "source_published_precision", "source_published_source", "source_updated_at",
    "application_deadline", "discovered_at", "first_seen_at", "last_seen_at", "last_verified_at", "status",
    "parsed_requirements", "parser_version", "content_hash",
    "job_sources(provider,company_name,external_key)",
  ].join(",");
  while (rows.length < limit) {
    const { data, error } = await db()
      .from("user_job_recommendations")
      .select(`quick_fit, discovery_jobs(${jobFields})`)
      .eq("user_id", userId)
      .eq("active", true)
      .order("fit_score", { ascending: false, nullsFirst: false })
      .order("recommended_at", { ascending: false })
      .range(rows.length, Math.min(limit, rows.length + pageSize) - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows.flatMap((row: any) => {
    const job = Array.isArray(row.discovery_jobs) ? row.discovery_jobs[0] : row.discovery_jobs;
    return job ? [{ job: { ...job, description: job.description || "", description_html: null } as DiscoveryJob, quickFit: row.quick_fit }] : [];
  }).sort((a: any, b: any) => {
    const aTime = a.job.source_published_at ? new Date(a.job.source_published_at).getTime() : 0;
    const bTime = b.job.source_published_at ? new Date(b.job.source_published_at).getTime() : 0;
    return bTime - aTime;
  }).slice(0, limit);
}

export async function getUserApplicationStates(userId: string, discoveryJobIds: string[]) {
  if (!discoveryJobIds.length) return new Map<string, { id: string; status: string; lastTouchedAt: string }>();
  const { data, error } = await db().from("jobs")
    .select("id,discovery_job_id,status,last_touched_at")
    .eq("user_id", userId).in("discovery_job_id", discoveryJobIds);
  if (error) throw error;
  return new Map((data || []).map((row: any) => [row.discovery_job_id, {
    id: row.id, status: row.status, lastTouchedAt: row.last_touched_at,
  }]));
}

export async function getUserApplicationState(userId: string, discoveryJobId: string) {
  const states = await getUserApplicationStates(userId, [discoveryJobId]);
  return states.get(discoveryJobId) || null;
}

export async function saveDiscoveryAnswer(userId: string, answer: Omit<DiscoveryAnswer, "id" | "provided_at">) {
  const { data, error } = await db().from("user_discovery_answers").upsert({
    user_id: userId,
    ...answer,
    provided_at: new Date().toISOString(),
  }, { onConflict: "user_id,question_key" }).select("*").single();
  if (error) throw error;
  return data as DiscoveryAnswer;
}

export async function saveRecommendationFit(userId: string, jobId: string, quickFit: any) {
  const { error } = await db().from("user_job_recommendations").update({
    fit_score: quickFit.score,
    fit_band: quickFit.band,
    eligibility_status: quickFit.eligibility.status,
    quick_fit: quickFit,
    last_evaluated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("discovery_job_id", jobId);
  if (error) throw error;
}

export async function getUserRecommendedJob(userId: string, jobId: string): Promise<{ job: DiscoveryJob; quickFit: any } | null> {
  const { data, error } = await db()
    .from("user_job_recommendations")
    .select("quick_fit, discovery_jobs(*, job_sources(provider, company_name, external_key))")
    .eq("user_id", userId)
    .eq("discovery_job_id", jobId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const job = Array.isArray(data.discovery_jobs) ? data.discovery_jobs[0] : data.discovery_jobs;
  return job ? { job: await ensureCurrentParsing(job as DiscoveryJob), quickFit: data.quick_fit } : null;
}

/** Stored recommendation metadata without requiring it to be active. */
export async function getUserRecommendationFit(userId: string, jobId: string): Promise<{ quick_fit: any; source_id: string; active: boolean } | null> {
  const { data, error } = await db().from("user_job_recommendations")
    .select("quick_fit,source_id,active")
    .eq("user_id", userId)
    .eq("discovery_job_id", jobId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getUserSourceIds(userId: string): Promise<string[]> {
  const { data, error } = await db().from("user_job_source_subscriptions")
    .select("source_id").eq("user_id", userId).eq("enabled", true);
  // Keep the existing feed usable during a rolling deploy before the additive
  // monitoring migration reaches the database.
  if (error && (error.code === "42P01" || error.code === "PGRST205")) return [];
  if (error) throw error;
  return (data || []).map((item: any) => item.source_id);
}

export async function getCachedMatch(args: {
  userId: string;
  jobId: string;
  profileHash: string;
  jobHash: string;
  matcherVersion: string;
}) {
  const { data, error } = await db()
    .from("job_match_runs")
    .select("result")
    .eq("user_id", args.userId)
    .eq("discovery_job_id", args.jobId)
    .eq("profile_hash", args.profileHash)
    .eq("job_hash", args.jobHash)
    .eq("matcher_version", args.matcherVersion)
    .maybeSingle();
  if (error) throw error;
  return data?.result || null;
}

export async function saveMatch(args: {
  userId: string;
  jobId: string;
  profileHash: string;
  jobHash: string;
  matcherVersion: string;
  result: unknown;
}) {
  const { error } = await db().from("job_match_runs").upsert({
    user_id: args.userId,
    discovery_job_id: args.jobId,
    profile_hash: args.profileHash,
    job_hash: args.jobHash,
    matcher_version: args.matcherVersion,
    result: args.result,
  }, { onConflict: "user_id,discovery_job_id,profile_hash,job_hash,matcher_version" });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Card-ready feed reads. These never call the matcher: stored fit is served as
// is and staleness is reported to the caller instead of being repaired inline.
// ---------------------------------------------------------------------------

/** Columns a list card needs. Descriptions, raw payloads, and parsed requirements stay on the detail route. */
export const DISCOVERY_CARD_FIELDS = [
  "id", "source_id", "source_job_id", "company_name", "title",
  "location", "workplace_type", "employment_type", "departments", "source_url", "apply_url",
  "source_published_at", "source_published_precision", "source_published_source", "source_updated_at",
  "application_deadline", "discovered_at", "first_seen_at", "last_seen_at", "last_verified_at", "status",
  "parser_version", "content_hash", "job_sources(provider,company_name,external_key)",
].join(",");

export const MATCH_CANDIDATE_CAP = 3_000;

function safeSearchTerm(value: string) {
  return value.replace(/[(),.%"\\]/g, " ").trim();
}

/**
 * One inner-joined query returns every qualifying recommendation for a user as
 * narrow rows already ordered by the provider's publication date. Predicates
 * the database can evaluate (score, bands, open status, freshness, company,
 * workplace, title search) are pushed down; the saved location rule is applied
 * by the caller because it is not expressible as a single SQL predicate yet.
 */
export async function getUserMatchCandidates(userId: string, options: {
  minimumFitScore: number;
  freshness?: number;
  query?: string;
  company?: string;
  location?: string;
  workplace?: string;
  maxRows?: number;
}): Promise<import("./feed").MatchCandidate[]> {
  const rows: any[] = [];
  const pageSize = 1_000;
  const maxRows = Math.max(pageSize, Math.min(options.maxRows || MATCH_CANDIDATE_CAP, 10_000));
  while (rows.length < maxRows) {
    let query = db().from("user_job_recommendations")
      .select("discovery_job_id,source_id,fit_score,fit_band,eligibility_status,evaluated_profile_hash:quick_fit->>evaluatedProfileHash,evaluated_matcher_version:quick_fit->>matcherVersion,evaluated_job_hash:quick_fit->>evaluatedJobHash,discovery_jobs!inner(id,source_published_at,discovered_at,location,workplace_type,content_hash)")
      .eq("user_id", userId).eq("active", true)
      .gt("fit_score", options.minimumFitScore)
      .neq("fit_band", "likely_conflict").neq("eligibility_status", "conflict")
      .eq("discovery_jobs.status", "open")
      .order("discovery_jobs(source_published_at)", { ascending: false, nullsFirst: false })
      .order("discovery_job_id", { ascending: true })
      .range(rows.length, rows.length + pageSize - 1);
    if (options.freshness && options.freshness > 0) query = query.gte("discovery_jobs.source_published_at", new Date(Date.now() - options.freshness * 86_400_000).toISOString());
    const search = safeSearchTerm(options.query || "");
    if (search) query = query.or(`title.ilike.%${search}%,company_name.ilike.%${search}%`, { referencedTable: "discovery_jobs" });
    if (options.company) query = query.ilike("discovery_jobs.company_name", `%${safeSearchTerm(options.company)}%`);
    if (options.location) query = query.ilike("discovery_jobs.location", `%${safeSearchTerm(options.location)}%`);
    if (options.workplace) query = query.ilike("discovery_jobs.workplace_type", options.workplace);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows.flatMap((row: any) => {
    const job = Array.isArray(row.discovery_jobs) ? row.discovery_jobs[0] : row.discovery_jobs;
    return job ? [{
      discovery_job_id: row.discovery_job_id,
      source_id: row.source_id,
      fit_score: row.fit_score,
      fit_band: row.fit_band,
      eligibility_status: row.eligibility_status,
      evaluated_profile_hash: row.evaluated_profile_hash,
      evaluated_matcher_version: row.evaluated_matcher_version,
      evaluated_job_hash: row.evaluated_job_hash,
      job,
    }] : [];
  });
}

/** Hydrates one page of match cards (job projection plus stored fit) in a single query, preserving the requested order. */
export async function getUserMatchCards(userId: string, ids: string[]): Promise<Array<{ job: DiscoveryJob; quickFit: any }>> {
  if (!ids.length) return [];
  const { data, error } = await db().from("user_job_recommendations")
    .select(`discovery_job_id,quick_fit,discovery_jobs!inner(${DISCOVERY_CARD_FIELDS})`)
    .eq("user_id", userId).in("discovery_job_id", ids);
  if (error) throw error;
  const byId = new Map<string, { job: DiscoveryJob; quickFit: any }>();
  for (const row of data || []) {
    const job = Array.isArray(row.discovery_jobs) ? row.discovery_jobs[0] : row.discovery_jobs;
    if (job) byId.set(row.discovery_job_id, { job: { ...job, description: "", description_html: null, parsed_requirements: [] } as DiscoveryJob, quickFit: row.quick_fit });
  }
  return ids.flatMap(id => { const item = byId.get(id); return item ? [item] : []; });
}

export type DiscoveryLocationPreferenceRows = Array<{ question_key: string; normalized_value: string | null }>;

export async function getUserLocationPreferenceRows(userId: string): Promise<DiscoveryLocationPreferenceRows> {
  const { data, error } = await db().from("user_discovery_answers")
    .select("question_key, normalized_value").eq("user_id", userId)
    .in("question_key", ["preference_country", "preference_regions", "preference_remote", "preference_location_scope"]);
  if (error) throw error;
  return (data || []) as DiscoveryLocationPreferenceRows;
}

// ---------------------------------------------------------------------------
// Shared catalog paging ("All roles").
// ---------------------------------------------------------------------------

let locationColumnsSupport: Promise<boolean> | null = null;

/**
 * The normalized geography columns arrive with the 20260904 migration. Until it
 * is applied, callers fall back to filtering a bounded window in memory. The
 * probe runs once per process and is re-run after a negative answer so a
 * rolling deploy picks the columns up without a restart.
 */
export function discoveryJobsSupportLocationColumns(): Promise<boolean> {
  if (!locationColumnsSupport) {
    locationColumnsSupport = (async () => {
      const { error } = await db().from("discovery_jobs").select("location_countries,location_remote").limit(1);
      if (!error) return true;
      if (error.code === "42703" || error.code === "PGRST204" || /location_countries/.test(String(error.message))) return false;
      throw error;
    })().then(supported => {
      if (!supported) setTimeout(() => { locationColumnsSupport = null; }, 60_000);
      return supported;
    }).catch(error => { locationColumnsSupport = null; throw error; });
  }
  return locationColumnsSupport;
}

export type CatalogJobPage = {
  items: DiscoveryJob[];
  total: number;
  totalIsEstimate: boolean;
  offset: number;
  nextOffset: number | null;
  locationFilteredInDatabase: boolean;
};

const CATALOG_FALLBACK_WINDOW = 1_000;

/**
 * One page of the shared catalog with every filter, including the saved
 * location rule, applied before paging. Cards use the narrow projection; the
 * exact count costs about 70 ms at 30k rows and keeps "Show more" truthful.
 */
export async function getCatalogDiscoveryJobPage(options: {
  offset: number;
  limit: number;
  filters: import("./catalog-filters").CatalogFilterOptions;
  location: import("./location").DiscoveryLocationPreferences;
}): Promise<CatalogJobPage> {
  const { applyCatalogFilterSteps, buildCatalogFilterSteps, buildCatalogLocationSteps } = await import("./catalog-filters");
  const { matchesDiscoveryLocation } = await import("./location");
  const limit = Math.max(1, Math.min(options.limit, 100));
  const offset = Math.max(0, options.offset);
  const filterSteps = buildCatalogFilterSteps(options.filters);
  const supportsLocation = await discoveryJobsSupportLocationColumns();

  if (supportsLocation) {
    let query = db().from("discovery_jobs").select(DISCOVERY_CARD_FIELDS, { count: "exact" });
    query = applyCatalogFilterSteps(query, [...filterSteps, ...buildCatalogLocationSteps(options.location)]);
    const { data, error, count } = await query
      .order("source_published_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    const items = (data || []).map((job: any) => ({ ...job, description: "", description_html: null, parsed_requirements: [] })) as DiscoveryJob[];
    const total = count ?? offset + items.length;
    return { items, total, totalIsEstimate: false, offset, nextOffset: offset + items.length < total ? offset + items.length : null, locationFilteredInDatabase: true };
  }

  // Fallback: page through a bounded newest-first window of narrow rows and
  // apply the location rule here. Totals are estimates because rows beyond the
  // window are not inspected.
  const narrow: any[] = [];
  const pageSize = 500;
  while (narrow.length < CATALOG_FALLBACK_WINDOW) {
    let query = db().from("discovery_jobs").select("id,location,workplace_type,source_published_at");
    query = applyCatalogFilterSteps(query, filterSteps);
    const { data, error } = await query
      .order("source_published_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(narrow.length, narrow.length + pageSize - 1);
    if (error) throw error;
    narrow.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  const visible = narrow.filter(job => matchesDiscoveryLocation(job, options.location));
  const pageIds = visible.slice(offset, offset + limit).map(job => job.id);
  const { data: rows, error: rowError } = pageIds.length
    ? await db().from("discovery_jobs").select(DISCOVERY_CARD_FIELDS).in("id", pageIds)
    : { data: [], error: null };
  if (rowError) throw rowError;
  const byId = new Map((rows || []).map((job: any) => [job.id, { ...job, description: "", description_html: null, parsed_requirements: [] }]));
  const items = pageIds.flatMap(id => { const job = byId.get(id); return job ? [job as DiscoveryJob] : []; });
  const exhausted = narrow.length < CATALOG_FALLBACK_WINDOW;
  return {
    items, total: visible.length, totalIsEstimate: !exhausted, offset,
    nextOffset: offset + items.length < visible.length ? offset + items.length : null,
    locationFilteredInDatabase: false,
  };
}
