import { supabaseAdmin } from "@/lib/supabase/client";
import { fetchSourceJobsWithMeta, hydrateSourceJob, prepareSourceJob, type NormalizedSourceJob, type SourceScanMode } from "./connectors";
import { assessDiscoveryEligibility, getDiscoveryApplicantProfile } from "./eligibility";
import { applyDiscoveryEligibilityGate, buildQuickFit, MATCHER_VERSION } from "./matcher";
import { hashText } from "./parser";
import { quickFitEquals } from "./fit-cache";
import { discoveryLocationColumns } from "./location";
import { discoveryJobsSupportLocationColumns } from "./repository";
import { answersToMatchingContext, type DiscoveryAnswer } from "./facts";
import type { DiscoveryJob, QuickFit } from "./types";

const MAX_RECOMMENDATIONS_PER_SOURCE = 30;
const MIN_RECOMMENDATION_SCORE = 10;
const MAX_SOURCE_CATALOG_JOBS = 100;
const MAX_CANDIDATES_PER_USER = MAX_SOURCE_CATALOG_JOBS;
const MAX_INLINE_DETAIL_HYDRATIONS = 12;

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
  // Discovery job rows can contain large descriptions and raw provider
  // payloads. The database's uniqueness constraints make retried and split
  // writes idempotent, so a temporarily expensive provider payload cannot
  // turn a successful scan into a source failure.
  const chunkSize = table === "discovery_jobs" ? 10 : 25;
  const isStatementTimeout = (error: any) => /statement timeout|canceling statement/i.test(String(error?.message || error?.details || error));
  const write = async (chunk: any[]): Promise<void> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error } = await db().from(table).upsert(chunk, options);
      if (!error) return;
      if (!isStatementTimeout(error) || attempt === 1) {
        if (isStatementTimeout(error) && chunk.length > 1) {
          const middle = Math.ceil(chunk.length / 2);
          await write(chunk.slice(0, middle));
          await write(chunk.slice(middle));
          return;
        }
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 250 + Math.floor(Math.random() * 150)));
    }
  };
  for (let index = 0; index < rows.length; index += chunkSize) {
    await write(rows.slice(index, index + chunkSize));
  }
}

async function upsertChangedDiscoveryJobs(sourceId: string, rows: any[], ingestionState = false) {
  if (!rows.length) return;
  const existingByKey = new Map<string, { content_hash: string | null; listing_hash?: string | null; status: string | null }>();
  for (let index = 0; index < rows.length; index += 100) {
    const sourceJobIds = rows.slice(index, index + 100).map(row => row.source_job_id);
    const { data, error } = await db().from("discovery_jobs")
      .select(ingestionState ? "source_job_id,content_hash,listing_hash,status" : "source_job_id,content_hash,status")
      .eq("source_id", sourceId)
      .in("source_job_id", sourceJobIds);
    if (error) throw error;
    for (const job of data || []) existingByKey.set(job.source_job_id, job);
  }

  // The database constraint prevents duplicates; this additionally avoids a
  // redundant write when a still-live posting has not changed.
  const changed = rows.filter(row => {
    const existing = existingByKey.get(row.source_job_id);
    return !existing || existing.content_hash !== row.content_hash ||
      (ingestionState && existing.listing_hash !== row.listing_hash) || existing.status !== "open";
  });
  await upsertInChunks("discovery_jobs", changed, { onConflict: "source_id,source_job_id" });
}

function sourceSupportsIngestionState(source: any) {
  return Object.prototype.hasOwnProperty.call(source, "scan_state");
}

function asCachedSourceJob(rawJob: NormalizedSourceJob, existing: any): NormalizedSourceJob {
  // Full-feed providers such as Jibe already return the canonical posting
  // body. Prefer that fresh body so corrections and edits from the employer
  // are reflected immediately. The cache is only for list-only providers
  // whose feed row still needs a previously hydrated detail page.
  if (rawJob.description?.trim() || !existing?.description) return rawJob;
  return {
    ...rawJob,
    description: existing.description,
    description_html: existing.description_html,
    workplace_type: rawJob.workplace_type || existing.workplace_type,
    employment_type: rawJob.employment_type || existing.employment_type,
    // Re-run only the deterministic local parser. This is cheap and ensures a
    // provider-side title/location change produces a matching content hash
    // without refetching the remote detail page.
    parsed_requirements: [],
    parser_version: existing.parser_version,
    content_hash: existing.content_hash,
    raw_payload: rawJob.raw_payload || existing.raw_payload,
  };
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

/**
 * Scan the shared employer catalog. `catalogOnly` is used by the scheduled
 * catalog sweep: jobs still get persisted and deduplicated even when nobody
 * follows the source yet. User matching and notifications remain opt-in.
 */
export async function syncSource(source: any, options: { catalogOnly?: boolean } = {}): Promise<SyncResult> {
  const database = db();
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const ingestionState = sourceSupportsIngestionState(source);
  const scanLockToken = ingestionState ? crypto.randomUUID() : null;
  await database.from("job_sources").update({ last_sync_started_at: startedAt }).eq("id", source.id);
  try {
    if (scanLockToken) {
      const { data: locked, error: lockError } = await database.from("job_sources").update({
        scan_lock_token: scanLockToken,
        scan_locked_until: new Date(Date.now() + 8 * 60_000).toISOString(),
      }).eq("id", source.id)
        .or(`scan_locked_until.is.null,scan_locked_until.lt.${startedAt}`)
        .select("id").maybeSingle();
      if (lockError) throw lockError;
      if (!locked) {
        return { sourceId: source.id, company: source.company_name, careerUrl: source.career_url, discovered: 0, verified: 0, matched: 0, fallbackImported: 0, fetched: 0, rejected: 0, durationMs: Date.now() - started, error: "Source scan is already running" };
      }
    }
    const { data: subscriptions, error: subscriptionError } = await database
      .from("user_job_source_subscriptions")
      .select("user_id, subscribed_at, min_fit_score, profiles(resume_text, transcript_text, bio)")
      .eq("source_id", source.id)
      .eq("enabled", true);
    if (subscriptionError) throw subscriptionError;
    if (!subscriptions?.length && !options.catalogOnly) {
      const now = new Date().toISOString();
      await database.from("job_sources").update({
        last_sync_completed_at: now,
        last_sync_error: null,
        next_sync_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        ...(scanLockToken ? { scan_lock_token: null, scan_locked_until: null } : {}),
      }).eq("id", source.id);
      return { sourceId: source.id, company: source.company_name, careerUrl: source.career_url, discovered: 0, verified: 0, matched: 0, fallbackImported: 0, fetched: 0, rejected: 0, durationMs: Date.now() - started };
    }

    const subscriberIds = (subscriptions as Subscription[] || []).map(subscription => subscription.user_id);
    let answerRows: any[] = [];
    if (subscriberIds.length) {
      const { data, error: answerError } = await database.from("user_discovery_answers")
        .select("*").in("user_id", subscriberIds).eq("reuse_approved", true);
      if (answerError && answerError.code !== "42P01" && answerError.code !== "PGRST205") throw answerError;
      answerRows = data || [];
    }
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
      return { subscription, background, profileHash: hashText(background), discovery: getDiscoveryApplicantProfile(background) };
    });
    const allStudents = subscriberProfiles.length > 0 && subscriberProfiles.every(item => item.discovery.isStudent);
    const sourceForFetch = source.provider === "ibm" && allStudents
      ? { ...source, config: { ...(source.config || {}), searchQueries: ["internship", "co-op"], maxJobs: 500 } }
      : source.provider === "oracle" && allStudents
        ? { ...source, config: { ...(source.config || {}), searchQueries: ["internship", "co-op", "student"], maxJobs: 500 } }
      : source.provider === "amazon" && allStudents
        ? { ...source, config: { ...(source.config || {}), searchQueries: ["intern", "co-op", "student"], maxJobs: 500 } }
      : source;
    const { data: existingSourceJobs, error: existingSourceError } = await database.from("discovery_jobs")
      .select("*").eq("source_id", source.id).order("discovered_at", { ascending: false }).limit(2_000);
    if (existingSourceError) throw existingSourceError;
    const existingBySourceJob = new Map<string, any>((existingSourceJobs || []).map((job: any) => [String(job.source_job_id), job]));
    const knownJobIds = new Set<string>(existingBySourceJob.keys());
    const lastFullScanAt = ingestionState ? source.last_full_scan_at : source.last_sync_completed_at;
    const dueReconcile = !lastFullScanAt || Date.now() - new Date(lastFullScanAt).getTime() >= 24 * 60 * 60_000;
    const scanMode: SourceScanMode = !knownJobIds.size ? "bootstrap" : dueReconcile ? "reconcile" : "incremental";
    const scan = await fetchSourceJobsWithMeta(sourceForFetch, {
      mode: scanMode,
      knownJobIds,
      scanState: ingestionState ? source.scan_state : {},
      lastFullScanAt,
      maxJobs: MAX_SOURCE_CATALOG_JOBS,
    });
    const fetched = scan.jobs;
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

    const detailProvider = sourceForFetch.provider === "workday" || sourceForFetch.provider === "oracle" || sourceForFetch.provider === "eightfold" || sourceForFetch.provider === "smartrecruiters" || sourceForFetch.provider === "avature" || sourceForFetch.provider === "indexed_site" || sourceForFetch.provider === "career_site";
    const cachedSourceJobs = newestSourceJobs.map(job => asCachedSourceJob(job, existingBySourceJob.get(job.source_job_id)));
    // A provider's latest frontier is still fetched each hour, because not
    // every ATS exposes a reliable posted-after filter. Once it is in hand,
    // only new, changed, or still-unenriched postings need matching work. A
    // daily reconciliation continues to cover edits that a provider surfaces
    // outside that frontier.
    const workItemIds = new Set(cachedSourceJobs.filter(job => {
      const existing = existingBySourceJob.get(job.source_job_id);
      return !existing || existing.status !== "open" || !existing.description ||
        (ingestionState && Boolean(job.listing_hash) && existing.listing_hash !== job.listing_hash) ||
        (Boolean(job.description) && existing.content_hash !== job.content_hash);
    }).map(job => job.source_job_id));
    const onlyProcessChanged = options.catalogOnly && scan.meta.mode === "incremental";
    const matchingCandidates = onlyProcessChanged
      ? cachedSourceJobs.filter(job => workItemIds.has(job.source_job_id))
      : cachedSourceJobs;
    const candidatesByUser = new Map<string, NormalizedSourceJob[]>();
    const candidatesToHydrate = new Map<string, NormalizedSourceJob>();
    for (const item of subscriberProfiles) {
      const candidates = matchingCandidates.slice(0, MAX_CANDIDATES_PER_USER);
      candidatesByUser.set(item.subscription.user_id, candidates);
      if (detailProvider) {
        for (const job of candidates) {
          if (!job.description && candidatesToHydrate.size < MAX_INLINE_DETAIL_HYDRATIONS) {
            candidatesToHydrate.set(job.source_job_id, job);
          }
        }
      }
    }
    // Prioritize jobs that can actually enter a subscriber's feed. Once those
    // details are covered, use any remaining inline budget to enrich the
    // general company catalog.
    if (detailProvider) {
      for (const job of matchingCandidates) {
        if (!job.description && candidatesToHydrate.size < MAX_INLINE_DETAIL_HYDRATIONS) {
          candidatesToHydrate.set(job.source_job_id, job);
        }
      }
    }

    const hydratedByKey = new Map<string, NormalizedSourceJob>();
    const hydrationCandidates = Array.from(candidatesToHydrate.values());
    const hydrationBatchSize = sourceForFetch.provider === "workday" || sourceForFetch.provider === "eightfold" ? 3 : 8;
    for (let index = 0; index < hydrationCandidates.length; index += hydrationBatchSize) {
      const hydrated = await Promise.allSettled(hydrationCandidates.slice(index, index + hydrationBatchSize).map(job => hydrateSourceJob(sourceForFetch, job)));
      hydrated.forEach(result => {
        if (result.status === "fulfilled") hydratedByKey.set(result.value.source_job_id, prepareSourceJob(result.value));
      });
    }

    const sourceCatalog = new Map<string, NormalizedSourceJob>();
    for (const rawJob of cachedSourceJobs) {
      const hydrated = hydratedByKey.get(rawJob.source_job_id) || prepareSourceJob(rawJob);
      sourceCatalog.set(hydrated.source_job_id, hydrated);
    }

    const evaluatedByUser = new Map<string, EvaluatedSourceJobs>();
    const evaluatedUnion = new Map<string, NormalizedSourceJob>();
    for (const item of subscriberProfiles) {
      const evaluated: EvaluatedJob[] = [];
      for (const rawJob of candidatesByUser.get(item.subscription.user_id) || []) {
        const job = hydratedByKey.get(rawJob.source_job_id) || prepareSourceJob(rawJob);
        if (!job.description.trim()) continue;
        const gate = assessDiscoveryEligibility(job, item.discovery);
        const quickFit = applyDiscoveryEligibilityGate({
          ...buildQuickFit(asDiscoveryJob(job, source), item.background),
          matcherVersion: MATCHER_VERSION,
          evaluatedProfileHash: item.profileHash,
          evaluatedJobHash: job.content_hash,
        }, gate);
        evaluated.push({ job, quickFit });
      }
      const alertable = evaluated
        .filter(entry =>
          entry.quickFit.discoveryEligible !== false &&
          entry.quickFit.score !== null &&
          entry.quickFit.score >= MIN_RECOMMENDATION_SCORE &&
          entry.quickFit.band !== "likely_conflict" &&
          entry.quickFit.eligibility.status !== "conflict"
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
    const writeLocationColumns = await discoveryJobsSupportLocationColumns();
    const persistedJobs = Array.from(sourceCatalog.values()).map(job => {
      const { source_published_precision, source_published_source, listing_hash, ...baseJob } = job;
      return {
        ...baseJob,
        source_id: source.id,
        company_name: source.company_name,
        status: "open",
        ...(writeLocationColumns ? discoveryLocationColumns(job.location, job.workplace_type) : {}),
        consecutive_misses: 0,
        last_verified_at: now,
        ...(ingestionState ? {
          last_seen_at: now,
          source_published_precision: source_published_precision || "unknown",
          source_published_source: source_published_source || null,
          listing_hash: listing_hash || null,
          bootstrap_observed: Boolean(existingBySourceJob.get(job.source_job_id)?.bootstrap_observed) ||
            (scan.meta.mode === "bootstrap" && !existingBySourceJob.has(job.source_job_id)),
          enrichment_status: job.description ? "complete" : "pending",
          enriched_at: job.description ? now : null,
        } : {}),
      };
    });
    await upsertChangedDiscoveryJobs(source.id, persistedJobs, ingestionState);
    if (ingestionState) {
      for (let index = 0; index < persistedJobs.length; index += 50) {
        const { error: seenError } = await database.from("discovery_jobs").update({
          last_seen_at: now,
          last_verified_at: now,
          consecutive_misses: 0,
        }).eq("source_id", source.id)
          .in("source_job_id", persistedJobs.slice(index, index + 50).map(job => job.source_job_id));
        if (seenError) throw seenError;
      }
    }
    let storedJobs: any[] = [];
    if (sourceCatalog.size) {
      const sourceJobIds = Array.from(sourceCatalog.keys());
      for (let index = 0; index < sourceJobIds.length; index += 50) {
        const { data, error: storedError } = await database.from("discovery_jobs")
          .select(ingestionState ? "id, source_job_id, title, company_name, location, first_seen_at, bootstrap_observed, enrichment_status" : "id, source_job_id, title, company_name, location")
          .eq("source_id", source.id)
          .in("source_job_id", sourceJobIds.slice(index, index + 50));
        if (storedError) throw storedError;
        storedJobs.push(...(data || []));
      }
    }
    const storedByKey = new Map(storedJobs.map((job: any) => [job.source_job_id, job]));

    let queuedEnrichmentCount = 0;
    if (ingestionState) {
      const queueRows = Array.from(sourceCatalog.values()).flatMap(job => {
        const stored = storedByKey.get(job.source_job_id) as any;
        return stored && !job.description ? [{
          discovery_job_id: stored.id,
          source_id: source.id,
          status: "pending",
          priority: existingBySourceJob.has(job.source_job_id) ? 100 : 20,
          next_attempt_at: now,
          updated_at: now,
        }] : [];
      });
      if (queueRows.length) await upsertInChunks("discovery_enrichment_queue", queueRows, {
        onConflict: "discovery_job_id",
        ignoreDuplicates: true,
      });
      if (subscriberProfiles.length && queueRows.length) {
        const { error: priorityError } = await database.from("discovery_enrichment_queue")
          .update({ priority: 5, updated_at: now })
          .eq("source_id", source.id)
          .in("status", ["pending", "retry_wait", "failed"])
          .gt("priority", 5);
        // During a rolling deployment the old status constraint does not know
        // retry_wait yet. Catalog persistence must remain available meanwhile.
        if (priorityError && priorityError.code !== "22P02") throw priorityError;
      }
      queuedEnrichmentCount = queueRows.length;
    }

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
      // Incremental provider scans intentionally inspect only a recent
      // frontier. A job missing from that bounded window is not closed, so do
      // not deactivate its recommendation here. Reconciliation updates the
      // canonical discovery_jobs status; the feed filters closed rows there.
      const changedRecommendations = recommendationRows.filter(row => {
        const existing = existingByJobId.get(row.discovery_job_id) as any;
        return !existing ||
          existing.active !== true ||
          existing.fit_score !== row.fit_score ||
          existing.fit_band !== row.fit_band ||
          existing.eligibility_status !== row.eligibility_status ||
          !quickFitEquals(existing.quick_fit, row.quick_fit);
      });
      if (changedRecommendations.length) {
        await upsertInChunks("user_job_recommendations", changedRecommendations, { onConflict: "user_id,discovery_job_id" });
      }
      // Low-confidence catalog roles are useful when the user deliberately
      // searches a company, but should never create a proactive alert.
      const newlyRecommended = evaluated.alertable.flatMap(entry => {
        const stored = storedByKey.get(entry.job.source_job_id) as any;
        const isBaseline = ingestionState && stored?.bootstrap_observed;
        const observedAfterSubscription = !ingestionState || !stored?.first_seen_at || new Date(stored.first_seen_at) >= new Date(item.subscription.subscribed_at);
        return stored && !existingIds.has(stored.id) && !isBaseline && observedAfterSubscription
          ? [{ jobId: stored.id, quickFit: entry.quickFit, job: stored }]
          : [];
      });
      discovered += newlyRecommended.length;
      await createInAppAlerts(item.subscription, newlyRecommended);
    }

    // One complete catalog sweep is scheduled hourly. Individual user actions
    // can still request a direct source scan, but should not permanently pull
    // the shared source into a more expensive cadence.
    const interval = Math.max(60, source.sync_interval_minutes || 60);
    await database.from("job_sources").update({
      last_sync_completed_at: now,
      last_sync_error: null,
      consecutive_failures: 0,
      next_sync_at: new Date(Date.now() + interval * 60_000).toISOString(),
      ...(ingestionState ? {
        scan_state: scan.meta.state,
        last_successful_scan_at: now,
        last_full_scan_at: scan.meta.fullScan ? now : source.last_full_scan_at,
        last_scan_mode: scan.meta.mode,
        last_scan_strategy: scan.meta.strategy,
        last_board_total: scan.meta.boardTotal,
        scan_lock_token: null,
        scan_locked_until: null,
      } : {}),
    }).eq("id", source.id);
    if (ingestionState) {
      const { error: telemetryError } = await database.from("discovery_scan_runs").insert({
        source_id: source.id,
        started_at: startedAt,
        finished_at: now,
        mode: scan.meta.mode,
        provider: source.provider,
        status: "succeeded",
        strategy: scan.meta.strategy,
        board_total: scan.meta.boardTotal,
        enumerated_count: scan.meta.enumeratedCount,
        pages_fetched: scan.meta.pagesFetched,
        new_job_count: Array.from(sourceCatalog.keys()).filter(id => !existingBySourceJob.has(id)).length,
        changed_job_count: 0,
        queued_enrichment_count: queuedEnrichmentCount,
        duration_ms: Date.now() - started,
        metadata: { warnings: scan.meta.warnings, authoritative: scan.meta.authoritative },
      });
      if (telemetryError) console.error("Unable to save discovery scan telemetry:", telemetryError);
    }
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
    const retryMinutes = Math.min(240, Math.max(60, (source.sync_interval_minutes || 60) * Math.pow(2, Math.min(failures - 1, 4))));
    await database.from("job_sources").update({
      last_sync_error: message,
      consecutive_failures: failures,
      next_sync_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
      ...(scanLockToken ? { scan_lock_token: null, scan_locked_until: null } : {}),
    }).eq("id", source.id);
    return { sourceId: source.id, company: source.company_name, careerUrl: source.career_url, discovered: 0, verified: 0, matched: 0, fallbackImported: 0, fetched: 0, rejected: 0, durationMs: Date.now() - started, error: message };
  }
}

export async function syncDueSources(options: { force?: boolean; limit?: number; sourceId?: string; sourceIds?: string[]; userId?: string } = {}) {
  const requestedSourceIds = Array.from(new Set([
    ...(options.sourceIds || []),
    ...(options.sourceId ? [options.sourceId] : []),
  ])).filter(Boolean);
  let subscriptionQuery = db().from("user_job_source_subscriptions").select("source_id").eq("enabled", true);
  if (options.userId) subscriptionQuery = subscriptionQuery.eq("user_id", options.userId);
  if (requestedSourceIds.length) subscriptionQuery = subscriptionQuery.in("source_id", requestedSourceIds);
  const { data: activeSubscriptions, error: activeSubscriptionError } = await subscriptionQuery;
  if (activeSubscriptionError) throw activeSubscriptionError;
  const subscribedSourceIds = Array.from(new Set((activeSubscriptions || []).map((row: any) => row.source_id))) as string[];
  if (!subscribedSourceIds.length) return [];
  let query = db().from("job_sources").select("*").eq("enabled", true).in("id", subscribedSourceIds).order("next_sync_at", { ascending: true }).limit(options.limit || 12);
  if (requestedSourceIds.length) query = query.in("id", requestedSourceIds);
  if (!options.force) query = query.lte("next_sync_at", new Date().toISOString());
  const { data: sources, error } = await query;
  if (error) throw error;
  const allowedSources = sources || [];
  const results: SyncResult[] = [];
  // Keep provider pressure bounded while avoiding one slow company blocking
  // every other followed source in a manual or scheduled scan.
  for (let index = 0; index < allowedSources.length; index += 3) {
    results.push(...await Promise.all(allowedSources.slice(index, index + 3).map((source: any) => syncSource(source))));
  }
  return results;
}

/**
 * Scan every enabled source, not merely sources with a current follower.
 * Sharding is deterministic so GitHub Actions can run several bounded Vercel
 * invocations in parallel without scanning the same employer twice.
 */
export async function syncCatalogSources(options: { shard?: number; shards?: number } = {}) {
  const shard = Math.max(0, Math.floor(options.shard || 0));
  const shards = Math.max(1, Math.min(8, Math.floor(options.shards || 1)));
  if (shard >= shards) throw new Error("Invalid catalog sync shard");

  const sources: any[] = [];
  const pageSize = 250;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db().from("job_sources").select("*")
      .eq("enabled", true).order("id", { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    sources.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  const assigned = sources.filter((_, index) => index % shards === shard);
  const results: SyncResult[] = [];
  for (let index = 0; index < assigned.length; index += 3) {
    results.push(...await Promise.all(assigned.slice(index, index + 3).map((source: any) => syncSource(source, { catalogOnly: true }))));
  }
  return results;
}
