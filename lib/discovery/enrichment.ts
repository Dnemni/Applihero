import { supabaseAdmin } from "@/lib/supabase/client";
import { hydrateSourceJob, prepareSourceJob, type NormalizedSourceJob } from "./connectors";
import type { JobProvider } from "./types";

const db = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured");
  return supabaseAdmin as any;
};

type QueueRow = { id: string; discovery_job_id: string; source_id: string; attempts: number };

function schemaUnavailable(error: any) {
  return error?.code === "42P01" || error?.code === "PGRST202" || error?.code === "PGRST205";
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Job detail enrichment failed");
}

export async function processDiscoveryEnrichment(limit = 20) {
  const database = db();
  const lockToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await database.rpc("claim_discovery_enrichment", {
    p_limit: Math.max(1, Math.min(limit, 100)),
    p_lock_token: lockToken,
  });
  if (claimError) {
    if (schemaUnavailable(claimError)) return { processed: 0, completed: 0, failed: 0, unavailable: true };
    throw claimError;
  }

  let completed = 0;
  let failed = 0;
  for (const queueRow of (claimed || []) as QueueRow[]) {
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
      const now = new Date().toISOString();
      const { error: updateError } = await database.from("discovery_jobs").update({
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
      await database.from("discovery_enrichment_queue").update({
        status: "complete", attempts: (queueRow.attempts || 0) + 1,
        locked_at: null, lock_token: null, last_error: null, updated_at: now,
      }).eq("id", queueRow.id).eq("lock_token", lockToken);
      completed += 1;
    } catch (error) {
      const attempts = (queueRow.attempts || 0) + 1;
      const retryMinutes = Math.min(24 * 60, 5 * Math.pow(2, Math.min(attempts - 1, 8)));
      const now = new Date().toISOString();
      await database.from("discovery_jobs").update({
        enrichment_status: attempts >= 8 ? "failed" : "pending",
        enrichment_attempts: attempts,
        enrichment_last_error: messageFor(error),
      }).eq("id", queueRow.discovery_job_id);
      await database.from("discovery_enrichment_queue").update({
        status: "failed", attempts,
        next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
        locked_at: null, lock_token: null, last_error: messageFor(error), updated_at: now,
      }).eq("id", queueRow.id).eq("lock_token", lockToken);
      failed += 1;
    }
  }
  return { processed: (claimed || []).length, completed, failed, unavailable: false };
}
