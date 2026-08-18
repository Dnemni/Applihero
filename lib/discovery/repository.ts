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

export async function getDiscoveryJob(id: string): Promise<DiscoveryJob | null> {
  const { data, error } = await db()
    .from("discovery_jobs")
    .select("*, job_sources(provider, company_name, external_key)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? ensureCurrentParsing(data as DiscoveryJob) : null;
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

export async function getUserRecommendedJobs(userId: string, limit = 60): Promise<Array<{ job: DiscoveryJob; quickFit: any }>> {
  const { data, error } = await db()
    .from("user_job_recommendations")
    .select("quick_fit, discovery_jobs(*, job_sources(provider, company_name, external_key))")
    .eq("user_id", userId)
    .eq("active", true)
    .order("fit_score", { ascending: false, nullsFirst: false })
    .order("recommended_at", { ascending: false })
    .limit(Math.max(limit, 200));
  if (error) throw error;
  return (data || []).flatMap((row: any) => {
    const job = Array.isArray(row.discovery_jobs) ? row.discovery_jobs[0] : row.discovery_jobs;
    return job ? [{ job: job as DiscoveryJob, quickFit: row.quick_fit }] : [];
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
