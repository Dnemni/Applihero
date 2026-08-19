import { supabaseAdmin } from "@/lib/supabase/client";
import { fetchSourceJobs, hydrateSourceJob, prepareSourceJob, type NormalizedSourceJob } from "./connectors";
import { assessDiscoveryEligibility, getDiscoveryApplicantProfile } from "./eligibility";
import { buildQuickFit } from "./matcher";
import { answersToMatchingContext, type DiscoveryAnswer } from "./facts";
import type { DiscoveryJob, QuickFit } from "./types";

const MAX_RECOMMENDATIONS_PER_SOURCE = 30;
const MIN_RECOMMENDATION_SCORE = 10;
const MAX_SOURCE_CATALOG_JOBS = 100;
const MAX_CANDIDATES_PER_USER = MAX_SOURCE_CATALOG_JOBS;

const db = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured");
  return supabaseAdmin as any;
};

type SyncResult = {
  sourceId: string;
  company: string;
  discovered: number;
  verified: number;
  fetched: number;
  rejected: number;
  durationMs: number;
  matched: number;
  fallbackImported: number;
  careerUrl?: string | null;
  error?: string;
};

type Subscription = {
  user_id: string;
  subscribed_at: string;
  min_fit_score: number;
  profiles: any;
};

type EvaluatedJob = { job: NormalizedSourceJob; quickFit: QuickFit };
type EvaluatedSourceJobs = {
  catalog: EvaluatedJob[];
  alertable: EvaluatedJob[];
};

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return String(record.message || record.details || record.hint || record.code || "Discovery scan failed");
  }
  return String(error || "Discovery scan failed");
}

function asDiscoveryJob(job: NormalizedSourceJob, source: any): DiscoveryJob {
  const now = new Date().toISOString();
  return {
    ...job,
    id: "pending",
    source_id: source.id,
    company_name: source.company_name,
    discovered_at: now,
    last_verified_at: now,
    status: "open",
  } as DiscoveryJob;
}

async function upsertInChunks(table: string, rows: any[], options: Record<string, unknown>) {
  for (let index = 0; index < rows.length; index += 100) {
    const { error } = await db().from(table).upsert(rows.slice(index, index + 100), options);
    if (error) throw error;
  }
}

async function upsertChangedDiscoveryJobs(sourceId: string, rows: any[]) {
  if (!rows.length) return;
  const existingByKey = new Map<string, { content_hash: string | null; status: string | null }>();
  for (let index = 0; index < rows.length; index += 100) {
    const sourceJobIds = rows.slice(index, index + 100).map(row => row.source_job_id);
    const { data, error } = await db().from("discovery_jobs")
      .select("source_job_id,content_hash,status")
      .eq("source_id", sourceId)
      .in("source_job_id", sourceJobIds);
    if (error) throw error;
    for (const job of data || []) existingByKey.set(job.source_job_id, job);
  }

  // The database constraint prevents duplicates; this additionally avoids a
  // redundant write when a still-live posting has not changed.
  const changed = rows.filter(row => {
    const existing = existingByKey.get(row.source_job_id);
    return !existing || existing.content_hash !== row.content_hash || existing.status !== "open";
  });
  await upsertInChunks("discovery_jobs", changed, { onConflict: "source_id,source_job_id" });
}

async function createInAppAlerts(subscription: Subscription, newRecommendations: Array<{ jobId: string; quickFit: QuickFit; job: any }>) {
  if (!newRecommendations.length) return;
  const database = db();
  const candidates = newRecommendations.map(item => ({
    user_id: subscription.user_id,
    discovery_job_id: item.jobId,
    fit_score: item.quickFit.score,
    fit_band: item.quickFit.band,
  }));
  const { error: candidateError } = await database.from("discovery_alert_candidates")
    .upsert(candidates, { onConflict: "user_id,discovery_job_id", ignoreDuplicates: true });
  if (candidateError) throw candidateError;

  const { data: pending, error: pendingError } = await database.from("discovery_alert_candidates")
    .select("id, fit_score, fit_band, discovery_jobs(id, title, company_name, location)")
    .eq("user_id", subscription.user_id)
    .is("notification_id", null)
    .order("created_at", { ascending: true });
  if (pendingError) throw pendingError;
  const matching = (pending || []).filter((item: any) =>
    item.fit_band !== "likely_conflict" && item.fit_score !== null && item.fit_score >= subscription.min_fit_score
  );
  const batch = matching.length ? matching.slice(0, 5) : (pending || []).length >= 5 ? (pending || []).slice(0, 5) : [];
  if (!batch.length) return;
  const jobs = batch.map((item: any) => Array.isArray(item.discovery_jobs) ? item.discovery_jobs[0] : item.discovery_jobs).filter(Boolean);
  const { data: notification, error: notificationError } = await database.from("discovery_notifications").insert({
    user_id: subscription.user_id,
    title: jobs.length === 1 && matching.length ? "A new job matches your profile" : `${jobs.length} new jobs to review`,
    body: jobs.length === 1 ? `${jobs[0].title} at ${jobs[0].company_name}` : `New roles from ${Array.from(new Set(jobs.map((job: any) => job.company_name))).join(", ")}`,
    job_ids: jobs.map((job: any) => job.id),
  }).select("id").single();
  if (notificationError) throw notificationError;
  const { error: linkedError } = await database.from("discovery_alert_candidates")
    .update({ notification_id: notification.id }).in("id", batch.map((item: any) => item.id));
  if (linkedError) throw linkedError;
}

export async function syncSource(source: any): Promise<SyncResult> {
  const database = db();
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  await database.from("job_sources").update({ last_sync_started_at: startedAt }).eq("id", source.id);
  try {
    const { data: subscriptions, error: subscriptionError } = await database
      .from("user_job_source_subscriptions")
      .select("user_id, subscribed_at, min_fit_score, profiles(resume_text, transcript_text, bio)")
      .eq("source_id", source.id)
      .eq("enabled", true);
    if (subscriptionError) throw subscriptionError;
    if (!subscriptions?.length) {
      const now = new Date().toISOString();
      await database.from("job_sources").update({ last_sync_completed_at: now, last_sync_error: null, next_sync_at: new Date(Date.now() + 15 * 60_000).toISOString() }).eq("id", source.id);
      return { sourceId: source.id, company: source.company_name, careerUrl: source.career_url, discovered: 0, verified: 0, matched: 0, fallbackImported: 0, fetched: 0, rejected: 0, durationMs: Date.now() - started };
    }

    const subscriberIds = (subscriptions as Subscription[]).map(subscription => subscription.user_id);
    const { data: answerRows, error: answerError } = await database.from("user_discovery_answers")
      .select("*").in("user_id", subscriberIds).eq("reuse_approved", true);
    if (answerError && answerError.code !== "42P01" && answerError.code !== "PGRST205") throw answerError;
    const answersByUser = new Map<string, DiscoveryAnswer[]>();
    for (const answer of answerRows || []) {
      const current = answersByUser.get(answer.user_id) || [];
      current.push(answer as DiscoveryAnswer);
      answersByUser.set(answer.user_id, current);
    }

    const subscriberProfiles = (subscriptions as Subscription[]).map(subscription => {
      const profile = Array.isArray(subscription.profiles) ? subscription.profiles[0] : subscription.profiles;
      const background = [
        profile?.resume_text,
        profile?.transcript_text,
        profile?.bio,
        answersToMatchingContext(answersByUser.get(subscription.user_id) || []),
      ].filter(Boolean).join("\n\n");
      return { subscription, background, discovery: getDiscoveryApplicantProfile(background) };
    });
    const allStudents = subscriberProfiles.every(item => item.discovery.isStudent);
    const sourceForFetch = source.provider === "ibm" && allStudents
      ? { ...source, config: { ...(source.config || {}), searchQueries: ["internship", "co-op"], maxJobs: 500 } }
      : source.provider === "oracle" && allStudents
        ? { ...source, config: { ...(source.config || {}), searchQueries: ["internship", "co-op", "student"], maxJobs: 500 } }
      : source.provider === "amazon" && allStudents
        ? { ...source, config: { ...(source.config || {}), searchQueries: ["intern", "co-op", "student"], maxJobs: 500 } }
      : source;
    const fetched = await fetchSourceJobs(sourceForFetch);
    const includeTitleTerms = Array.isArray(source.config?.includeTitleTerms)
      ? source.config.includeTitleTerms.map((term: unknown) => String(term).toLowerCase().trim()).filter(Boolean) : [];
    const titleFiltered = includeTitleTerms.length
      ? fetched.filter(job => includeTitleTerms.some((term: string) => job.title.toLowerCase().includes(term)))
      : fetched;
    // Keep the shared database catalog bounded to recent openings. We still
    // fetch the board first, so a newly posted role cannot be skipped just
    // because an older board has thousands of open records.
    const newestSourceJobs = [...titleFiltered]
      .sort((a, b) => new Date(b.source_published_at || 0).getTime() - new Date(a.source_published_at || 0).getTime())
      .slice(0, MAX_SOURCE_CATALOG_JOBS);

    const candidatesByUser = new Map<string, NormalizedSourceJob[]>();
    const candidatesToHydrate = new Map<string, NormalizedSourceJob>(newestSourceJobs.map(job => [job.source_job_id, job]));
    for (const item of subscriberProfiles) {
      const candidates = newestSourceJobs
        .filter(rawJob => assessDiscoveryEligibility(rawJob, item.discovery).eligible)
        .slice(0, MAX_CANDIDATES_PER_USER);
      candidatesByUser.set(item.subscription.user_id, candidates);
      candidates.forEach(job => candidatesToHydrate.set(job.source_job_id, job));
    }

    const hydratedByKey = new Map<string, NormalizedSourceJob>();
    const hydrationCandidates = Array.from(candidatesToHydrate.values());
    const hydrationBatchSize = sourceForFetch.provider === "workday" ? 3 : 8;
    for (let index = 0; index < hydrationCandidates.length; index += hydrationBatchSize) {
      const hydrated = await Promise.all(hydrationCandidates.slice(index, index + hydrationBatchSize).map(job => hydrateSourceJob(sourceForFetch, job)));
      hydrated.forEach(job => hydratedByKey.set(job.source_job_id, prepareSourceJob(job)));
    }

    const sourceCatalog = new Map<string, NormalizedSourceJob>();
    for (const rawJob of newestSourceJobs) {
      const hydrated = hydratedByKey.get(rawJob.source_job_id) || prepareSourceJob(rawJob);
      sourceCatalog.set(hydrated.source_job_id, hydrated);
    }

    const evaluatedByUser = new Map<string, EvaluatedSourceJobs>();
    const evaluatedUnion = new Map<string, NormalizedSourceJob>();
    for (const item of subscriberProfiles) {
      const evaluated: EvaluatedJob[] = [];
      for (const rawJob of candidatesByUser.get(item.subscription.user_id) || []) {
        const job = hydratedByKey.get(rawJob.source_job_id) || prepareSourceJob(rawJob);
        const quickFit = buildQuickFit(asDiscoveryJob(job, source), item.background);
        evaluated.push({ job, quickFit });
      }
      const alertable = evaluated
        .filter(item =>
          item.quickFit.score !== null &&
          item.quickFit.score >= MIN_RECOMMENDATION_SCORE &&
          item.quickFit.band !== "likely_conflict" &&
          item.quickFit.eligibility.status !== "conflict"
        )
        .sort((a, b) => (b.quickFit.score ?? -1) - (a.quickFit.score ?? -1))
        .slice(0, MAX_RECOMMENDATIONS_PER_SOURCE);

      // Save the eligible, per-user company catalog as well as the alertable
      // shortlist. This lets an intentional company or keyword search reveal
      // lower-scoring roles without weakening the default discovery feed.
      evaluatedByUser.set(item.subscription.user_id, { catalog: evaluated, alertable });
      evaluated.forEach(item => evaluatedUnion.set(item.job.source_job_id, item.job));
    }

    const now = new Date().toISOString();
    const persistedJobs = Array.from(sourceCatalog.values()).map(job => ({
      ...job,
      source_id: source.id,
      company_name: source.company_name,
      status: "open",
      consecutive_misses: 0,
      last_verified_at: now,
    }));
    await upsertChangedDiscoveryJobs(source.id, persistedJobs);
    let storedJobs: any[] = [];
    if (sourceCatalog.size) {
      const { data, error: storedError } = await database.from("discovery_jobs")
        .select("id, source_job_id, title, company_name, location")
        .eq("source_id", source.id)
        .in("source_job_id", Array.from(sourceCatalog.keys()));
      if (storedError) throw storedError;
      storedJobs = data || [];
    }
    const storedByKey = new Map(storedJobs.map((job: any) => [job.source_job_id, job]));

    let discovered = 0;
    for (const item of subscriberProfiles) {
      const evaluated = evaluatedByUser.get(item.subscription.user_id) || { catalog: [], alertable: [] };
      const { data: existingRecommendations, error: existingError } = await database.from("user_job_recommendations")
        .select("discovery_job_id,fit_score,fit_band,eligibility_status,quick_fit,active")
        .eq("user_id", item.subscription.user_id).eq("source_id", source.id);
      if (existingError) throw existingError;
      const existingIds = new Set((existingRecommendations || []).map((row: any) => row.discovery_job_id));
      const existingByJobId = new Map((existingRecommendations || []).map((row: any) => [row.discovery_job_id, row]));
      const recommendationRows = evaluated.catalog.flatMap(entry => {
        const stored = storedByKey.get(entry.job.source_job_id) as any;
        return stored ? [{
          user_id: item.subscription.user_id,
          source_id: source.id,
          discovery_job_id: stored.id,
          fit_score: entry.quickFit.score,
          fit_band: entry.quickFit.band,
          eligibility_status: entry.quickFit.eligibility.status,
          quick_fit: entry.quickFit,
          active: true,
          last_evaluated_at: now,
        }] : [];
      });
      const activeIds = recommendationRows.map(row => row.discovery_job_id);
      await database.from("user_job_recommendations").update({ active: false, last_evaluated_at: now })
        .eq("user_id", item.subscription.user_id).eq("source_id", source.id)
        .eq("active", true)
        .not("discovery_job_id", "in", `(${activeIds.join(",") || "00000000-0000-0000-0000-000000000000"})`);
      const changedRecommendations = recommendationRows.filter(row => {
        const existing = existingByJobId.get(row.discovery_job_id) as any;
        return !existing ||
          existing.active !== true ||
          existing.fit_score !== row.fit_score ||
          existing.fit_band !== row.fit_band ||
          existing.eligibility_status !== row.eligibility_status ||
          JSON.stringify(existing.quick_fit) !== JSON.stringify(row.quick_fit);
      });
      if (changedRecommendations.length) {
        await upsertInChunks("user_job_recommendations", changedRecommendations, { onConflict: "user_id,discovery_job_id" });
      }
      // Low-confidence catalog roles are useful when the user deliberately
      // searches a company, but should never create a proactive alert.
      const newlyRecommended = evaluated.alertable.flatMap(entry => {
        const stored = storedByKey.get(entry.job.source_job_id) as any;
        return stored && !existingIds.has(stored.id) ? [{ jobId: stored.id, quickFit: entry.quickFit, job: stored }] : [];
      });
      discovered += newlyRecommended.length;
      await createInAppAlerts(item.subscription, newlyRecommended);
    }

    const interval = Math.max(15, source.sync_interval_minutes || 15);
    await database.from("job_sources").update({
      last_sync_completed_at: now,
      last_sync_error: null,
      consecutive_failures: 0,
      next_sync_at: new Date(Date.now() + interval * 60_000).toISOString(),
    }).eq("id", source.id);
    return {
      sourceId: source.id,
      company: source.company_name,
      careerUrl: source.career_url,
      discovered,
      verified: sourceCatalog.size,
      matched: evaluatedUnion.size,
      fallbackImported: evaluatedUnion.size ? 0 : sourceCatalog.size,
      fetched: fetched.length,
      rejected: fetched.length - sourceCatalog.size,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const message = readableError(error);
    const failures = (source.consecutive_failures || 0) + 1;
    const retryMinutes = Math.min(240, Math.max(15, (source.sync_interval_minutes || 15) * Math.pow(2, Math.min(failures - 1, 4))));
    await database.from("job_sources").update({
      last_sync_error: message,
      consecutive_failures: failures,
      next_sync_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
    }).eq("id", source.id);
    return { sourceId: source.id, company: source.company_name, careerUrl: source.career_url, discovered: 0, verified: 0, matched: 0, fallbackImported: 0, fetched: 0, rejected: 0, durationMs: Date.now() - started, error: message };
  }
}

export async function syncDueSources(options: { force?: boolean; limit?: number; sourceId?: string; userId?: string } = {}) {
  let subscriptionQuery = db().from("user_job_source_subscriptions").select("source_id").eq("enabled", true);
  if (options.userId) subscriptionQuery = subscriptionQuery.eq("user_id", options.userId);
  if (options.sourceId) subscriptionQuery = subscriptionQuery.eq("source_id", options.sourceId);
  const { data: activeSubscriptions, error: activeSubscriptionError } = await subscriptionQuery;
  if (activeSubscriptionError) throw activeSubscriptionError;
  const subscribedSourceIds = Array.from(new Set((activeSubscriptions || []).map((row: any) => row.source_id))) as string[];
  if (!subscribedSourceIds.length) return [];
  let query = db().from("job_sources").select("*").eq("enabled", true).in("id", subscribedSourceIds).order("next_sync_at", { ascending: true }).limit(options.limit || 12);
  if (options.sourceId) query = query.eq("id", options.sourceId);
  if (!options.force) query = query.lte("next_sync_at", new Date().toISOString());
  const { data: sources, error } = await query;
  if (error) throw error;
  const allowedSources = sources || [];
  const results: SyncResult[] = [];
  // Keep provider pressure bounded while avoiding one slow company blocking
  // every other followed source in a manual or scheduled scan.
  for (let index = 0; index < allowedSources.length; index += 3) {
    results.push(...await Promise.all(allowedSources.slice(index, index + 3).map(syncSource)));
  }
  return results;
}
