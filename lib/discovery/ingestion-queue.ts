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
  const database = db();
  const { data: reconciled, error: reconcileError } = await database.rpc("reconcile_discovery_ingestion_tasks");
  // Keep rolling deployments safe while the additive hardening migration is
  // still propagating. The normal dispatcher remains available immediately.
  if (reconcileError && reconcileError.code !== "PGRST202" && reconcileError.code !== "42883") throw reconcileError;
  const { data, error } = await database.rpc("enqueue_discovery_ingestion_hour", {
    p_scheduled_for: scheduledFor,
  });
  if (error) throw error;
  return { scheduledFor, reconciledCount: reconcileError ? 0 : Number(reconciled || 0), ...(Array.isArray(data) ? data[0] : data || {}) };
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
    const sourceLeaseToken = crypto.randomUUID();
    let sourceLeaseAcquired = false;
    try {
      const { data: source, error } = await database.from("job_sources").select("*").eq("id", task.source_id).maybeSingle();
      if (error) throw error;
      // A source may be disabled after dispatch. Complete this historical task
      // without calling a provider; the next dispatcher skips disabled rows.
      if (!source || !source.enabled) {
        succeeded = true;
        summary = { skipped: "source_disabled" };
      } else {
        const { data: acquired, error: acquireError } = await database.rpc("acquire_discovery_source_lease", {
          p_source_id: task.source_id,
          p_lease_token: sourceLeaseToken,
          p_lease_seconds: 480,
        });
        const leaseRpcUnavailable = acquireError?.code === "PGRST202" || acquireError?.code === "42883";
        if (acquireError && !leaseRpcUnavailable) throw acquireError;
        sourceLeaseAcquired = !acquireError && acquired === true;
        if (!acquireError && !sourceLeaseAcquired) {
          const { data: deferred, error: deferError } = await database.rpc("defer_discovery_ingestion_task", {
            p_task_id: task.id,
            p_lease_token: leaseToken,
            p_delay_seconds: 60,
            p_reason: "Source scan lease is busy",
          });
          if (deferError) throw deferError;
          return deferred === true ? { taskId: task.id, sourceId: task.source_id, status: "deferred" as const } : null;
        }
        const result = await syncSource(source, {
          catalogOnly: true,
          ...(sourceLeaseAcquired ? { preclaimedScanLockToken: sourceLeaseToken } : {}),
        });
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
    if (succeeded) {
      const { error: reconcileError } = await database.rpc("reconcile_discovery_source_tasks", { p_source_id: task.source_id });
      if (reconcileError && reconcileError.code !== "PGRST202" && reconcileError.code !== "42883") {
        console.error(`Unable to reconcile sibling discovery tasks for ${task.source_id}:`, reconcileError);
      }
    }
    if (sourceLeaseAcquired) {
      const { error: releaseError } = await database.rpc("release_discovery_source_lease", {
        p_source_id: task.source_id,
        p_lease_token: sourceLeaseToken,
      });
      if (releaseError && releaseError.code !== "PGRST202" && releaseError.code !== "42883") {
        console.error(`Unable to release discovery source lease for ${task.source_id}:`, releaseError);
      }
    }
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
    deferred: results.filter(result => result.status === "deferred").length,
    results,
  };
}

const pause = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

/**
 * Drain one lane without creating a long-lived worker. A short idle grace
 * lets another lane finish a task and release a retry before this lane exits.
 */
type WorkerResult = Awaited<ReturnType<typeof runDiscoveryIngestionWorker>>;

export async function drainWith(
  runner: () => Promise<WorkerResult>,
  options: { maxTasks?: number; idlePolls?: number; budgetMs?: number; now?: () => number; idlePause?: () => Promise<unknown> } = {},
) {
  const maxTasks = Math.max(1, Math.min(options.maxTasks || 34, 40));
  const idlePolls = Math.max(1, Math.min(options.idlePolls || 3, 5));
  const budgetMs = Math.max(1, Math.min(options.budgetMs || 230_000, 280_000));
  const now = options.now || Date.now;
  const started = now();
  const results: WorkerResult[] = [];
  let idle = 0;
  let claimed = 0;
  while (claimed < maxTasks && idle < idlePolls && now() - started < budgetMs) {
    const result = await runner();
    results.push(result);
    claimed += result.claimed;
    if (result.claimed) {
      idle = 0;
      continue;
    }
    idle += 1;
    if (idle < idlePolls) await (options.idlePause ? options.idlePause() : pause(1_500));
  }
  const exhaustedBudget = now() - started >= budgetMs;
  return {
    claimed,
    completed: results.reduce((sum, result) => sum + result.completed, 0),
    retried: results.reduce((sum, result) => sum + result.retried, 0),
    failed: results.reduce((sum, result) => sum + result.failed, 0),
    deferred: results.reduce((sum, result) => sum + result.deferred, 0),
    idlePolls: idle,
    exhaustedCapacity: claimed >= maxTasks,
    exhaustedBudget,
  };
}

export async function drainDiscoveryIngestionWorker(options: { maxTasks?: number; idlePolls?: number; budgetMs?: number } = {}) {
  return drainWith(() => runDiscoveryIngestionWorker(1), options);
}

export async function retryDiscoveryIngestionTask(taskId: string) {
  const { data, error } = await db().rpc("retry_discovery_ingestion_task", { p_task_id: taskId });
  if (error) throw error;
  return data === true;
}
