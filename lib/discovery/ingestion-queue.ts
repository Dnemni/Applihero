import { supabaseAdmin } from "@/lib/supabase/client";
import { syncSource } from "./sync";

const db = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured");
  return supabaseAdmin as any;
};

export type IngestionTask = {
  id: string;
  source_id: string;
  scheduled_for: string;
  attempts: number;
  max_attempts: number;
};

export function hourlyBucket(value: Date = new Date()) {
  const bucket = new Date(value);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket.toISOString();
}

export function boundedInteger(value: string | null | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export function retryDelaySeconds(attempt: number) {
  // 5m, 10m, 20m, ... capped at one hour. Jitter prevents a provider outage
  // from making every failed source retry at exactly the same instant.
  const base = Math.min(3600, 300 * Math.pow(2, Math.max(0, attempt - 1)));
  return base + Math.floor(Math.random() * 30);
}

export async function enqueueHourlyDiscoveryTasks(scheduledFor = hourlyBucket()) {
  const { data, error } = await db().rpc("enqueue_discovery_ingestion_hour", {
    p_scheduled_for: scheduledFor,
  });
  if (error) throw error;
  return { scheduledFor, ...(Array.isArray(data) ? data[0] : data || {}) };
}

export async function runDiscoveryIngestionWorker(limit = 2) {
  const database = db();
  const leaseToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await database.rpc("claim_discovery_ingestion_tasks", {
    p_limit: Math.max(1, Math.min(limit, 3)),
    p_lease_token: leaseToken,
    p_lease_seconds: 240,
  });
  if (claimError) throw claimError;

  const processed = await Promise.all(((claimed || []) as IngestionTask[]).map(async task => {
    let succeeded = false;
    let errorMessage: string | undefined;
    let summary: Record<string, unknown> = {};
    try {
      const { data: source, error } = await database.from("job_sources").select("*").eq("id", task.source_id).maybeSingle();
      if (error) throw error;
      // A source may be disabled after dispatch. Complete this historical task
      // without calling a provider; the next dispatcher skips disabled rows.
      if (!source || !source.enabled) {
        succeeded = true;
        summary = { skipped: "source_disabled" };
      } else {
        const result = await syncSource(source, { catalogOnly: true });
        summary = {
          company: result.company,
          fetched: result.fetched,
          verified: result.verified,
          matched: result.matched,
          durationMs: result.durationMs,
        };
        if (result.error) throw new Error(result.error);
        succeeded = true;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error || "Discovery scan failed");
      summary = { ...summary, error: errorMessage };
    }
    const { data: finished, error: finishError } = await database.rpc("finish_discovery_ingestion_task", {
      p_task_id: task.id,
      p_lease_token: leaseToken,
      p_succeeded: succeeded,
      p_result_summary: summary,
      p_error: errorMessage || null,
      p_retry_seconds: retryDelaySeconds(task.attempts),
    });
    if (finishError) throw finishError;
    // A false result means the lease expired or a newer worker recovered it;
    // do not attempt a second write from this stale worker.
    if (finished !== true) return null;
    return {
      taskId: task.id,
      sourceId: task.source_id,
      status: succeeded ? "succeeded" : task.attempts >= task.max_attempts ? "failed" : "retry_wait",
      ...(errorMessage ? { error: errorMessage } : {}),
    };
  }));
  // Tasks are independent source scans. Processing the claimed batch in
  // parallel cuts worker wall time without creating unbounded provider load:
  // the claim and route caps still limit each invocation to three sources.
  const results = processed.filter((result): result is NonNullable<typeof result> => result !== null);
  return {
    claimed: (claimed || []).length,
    completed: results.filter(result => result.status === "succeeded").length,
    retried: results.filter(result => result.status === "retry_wait").length,
    failed: results.filter(result => result.status === "failed").length,
    results,
  };
}

export async function retryDiscoveryIngestionTask(taskId: string) {
  const { data, error } = await db().rpc("retry_discovery_ingestion_task", { p_task_id: taskId });
  if (error) throw error;
  return data === true;
}
