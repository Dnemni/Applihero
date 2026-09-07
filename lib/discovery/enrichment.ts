import { supabaseAdmin } from "@/lib/supabase/client";
import { hydrateSourceJob, prepareSourceJob, type NormalizedSourceJob } from "./connectors";
import type { JobProvider } from "./types";
import { discoveryJobsSupportLocationColumns } from "./repository";
import { discoveryLocationColumns } from "./location";

const db = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured");
  return supabaseAdmin as any;
};

type QueueRow = { id: string; discovery_job_id: string; source_id: string; attempts: number; max_attempts?: number; claimed_attempt?: number | null };

export function enrichmentAttempt(row: { attempts: number; claimed_attempt?: number | null }) {
  return row.claimed_attempt ?? (row.attempts || 0) + 1;
}

function schemaUnavailable(error: any) {
  return error?.code === "42P01" || error?.code === "PGRST202" || error?.code === "PGRST205";
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Job detail enrichment failed");
}

export type EnrichmentFailure = {
  message: string;
  retryable: boolean;
  kind: "transient" | "permanent" | "unavailable";
};

export function classifyEnrichmentFailure(error: unknown): EnrichmentFailure {
  const message = messageFor(error);
  const status = Number(message.match(/(?:returned|status)\s+(\d{3})(?:\D|$)/i)?.[1] || 0);
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return { message, retryable: false, kind: "permanent" };
  }
  if (/unavailable|empty detail|no detail/i.test(message)) {
    return { message, retryable: true, kind: "unavailable" };
  }
  return { message, retryable: true, kind: "transient" };
}

type EnrichmentResult = "completed" | "retried" | "dead";

async function processClaimedEnrichment(queueRow: QueueRow, lockToken: string): Promise<EnrichmentResult> {
  const database = db();
  try {
      const { data: job, error: jobError } = await database.from("discovery_jobs").select("*")
        .eq("id", queueRow.discovery_job_id).single();
      if (jobError) throw jobError;
      const { data: source, error: sourceError } = await database.from("job_sources").select("*")
        .eq("id", queueRow.source_id).single();
      if (sourceError) throw sourceError;

      const hydrated = prepareSourceJob(await hydrateSourceJob(
        { provider: source.provider as JobProvider, config: source.config || {} },
        job as NormalizedSourceJob,
      ));
      if (!hydrated.description?.trim()) {
        throw new Error("Job detail is unavailable: provider returned an empty detail");
      }
      const now = new Date().toISOString();
      const writeLocationColumns = await discoveryJobsSupportLocationColumns();
      const { error: updateError } = await database.from("discovery_jobs").update({
        ...(writeLocationColumns ? discoveryLocationColumns(hydrated.location, hydrated.workplace_type) : {}),
        title: hydrated.title,
        description: hydrated.description,
        description_html: hydrated.description_html,
        location: hydrated.location,
        workplace_type: hydrated.workplace_type,
        employment_type: hydrated.employment_type,
        departments: hydrated.departments,
        source_url: hydrated.source_url,
        apply_url: hydrated.apply_url,
        source_published_at: hydrated.source_published_at,
        source_published_precision: hydrated.source_published_precision || "unknown",
        source_published_source: hydrated.source_published_source || null,
        source_updated_at: hydrated.source_updated_at,
        application_deadline: hydrated.application_deadline,
        raw_payload: hydrated.raw_payload,
        parsed_requirements: hydrated.parsed_requirements,
        parser_version: hydrated.parser_version,
        content_hash: hydrated.content_hash,
        listing_hash: hydrated.listing_hash || job.listing_hash,
        enrichment_status: "complete",
        enrichment_attempts: (job.enrichment_attempts || 0) + 1,
        enrichment_last_error: null,
        enriched_at: now,
      }).eq("id", job.id);
      if (updateError) throw updateError;
      const { error: finishError } = await database.from("discovery_enrichment_queue").update({
        status: "complete", attempts: enrichmentAttempt(queueRow),
        locked_at: null, lock_token: null, last_error: null, failure_kind: null,
        finished_at: now, updated_at: now,
      }).eq("id", queueRow.id).eq("lock_token", lockToken);
      if (finishError) throw finishError;
      return "completed";
    } catch (error) {
      const attempts = enrichmentAttempt(queueRow);
      const maxAttempts = Math.max(1, queueRow.max_attempts || 8);
      const failure = classifyEnrichmentFailure(error);
      const terminal = !failure.retryable || attempts >= maxAttempts;
      const retryMinutes = Math.min(24 * 60, 5 * Math.pow(2, Math.min(attempts - 1, 8)));
      const now = new Date().toISOString();
      const { error: jobFailureError } = await database.from("discovery_jobs").update({
        enrichment_status: terminal ? "failed" : "pending",
        enrichment_attempts: attempts,
        enrichment_last_error: failure.message,
      }).eq("id", queueRow.discovery_job_id);
      if (jobFailureError) throw jobFailureError;
      const { error: failureError } = await database.from("discovery_enrichment_queue").update({
        status: terminal ? "dead" : "retry_wait", attempts,
        next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
        locked_at: null, lock_token: null, last_error: failure.message,
        failure_kind: terminal && failure.retryable ? "exhausted" : failure.kind,
        finished_at: terminal ? now : null,
        updated_at: now,
      }).eq("id", queueRow.id).eq("lock_token", lockToken);
      if (failureError) throw failureError;
      return terminal ? "dead" : "retried";
    }
}

export async function processDiscoveryEnrichment(limit = 4, options: { reconcile?: boolean } = {}) {
  const database = db();
  const lockToken = crypto.randomUUID();
  const { data: reconciled, error: reconcileError } = options.reconcile === false
    ? { data: null, error: null } : await database.rpc("reconcile_discovery_enrichment_queue");
  if (reconcileError && !schemaUnavailable(reconcileError)) throw reconcileError;
  const { data: claimed, error: claimError } = await database.rpc("claim_discovery_enrichment", {
    p_limit: Math.max(1, Math.min(limit, 8)),
    p_lock_token: lockToken,
  });
  if (claimError) {
    if (schemaUnavailable(claimError)) return { processed: 0, completed: 0, retried: 0, dead: 0, failed: 0, unavailable: true };
    throw claimError;
  }

  const results = await Promise.all(((claimed || []) as QueueRow[]).map(row => processClaimedEnrichment(row, lockToken)));
  const retried = results.filter(result => result === "retried").length;
  const dead = results.filter(result => result === "dead").length;
  return {
    processed: results.length,
    completed: results.filter(result => result === "completed").length,
    retried,
    dead,
    failed: retried + dead,
    reconciled: reconcileError ? null : (Array.isArray(reconciled) ? reconciled[0] : reconciled),
    unavailable: false,
  };
}

type EnrichmentBatchResult = Awaited<ReturnType<typeof processDiscoveryEnrichment>>;

export async function drainEnrichmentWith(
  runner: () => Promise<EnrichmentBatchResult>,
  options: { maxItems?: number; budgetMs?: number; now?: () => number } = {},
) {
  const maxItems = Math.max(1, Math.min(options.maxItems || 40, 100));
  const budgetMs = Math.max(1, Math.min(options.budgetMs || 45_000, 90_000));
  const now = options.now || Date.now;
  const started = now();
  const batches: EnrichmentBatchResult[] = [];
  let processed = 0;
  while (processed < maxItems && now() - started < budgetMs) {
    const result = await runner();
    batches.push(result);
    processed += result.processed;
    if (!result.processed || result.unavailable) break;
  }
  return {
    processed,
    completed: batches.reduce((sum, result) => sum + result.completed, 0),
    retried: batches.reduce((sum, result) => sum + result.retried, 0),
    dead: batches.reduce((sum, result) => sum + result.dead, 0),
    exhaustedCapacity: processed >= maxItems,
    exhaustedBudget: now() - started >= budgetMs,
    unavailable: batches.some(result => result.unavailable),
  };
}

export async function drainDiscoveryEnrichment(options: { maxItems?: number; budgetMs?: number; batchSize?: number } = {}) {
  const batchSize = Math.max(1, Math.min(options.batchSize || 4, 8));
  let firstBatch = true;
  return drainEnrichmentWith(() => {
    const reconcile = firstBatch;
    firstBatch = false;
    return processDiscoveryEnrichment(batchSize, { reconcile });
  }, options);
}
