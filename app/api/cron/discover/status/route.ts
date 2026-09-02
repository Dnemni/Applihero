import { NextRequest, NextResponse } from "next/server";
import { hasCronAuthorization } from "@/lib/discovery/cron";
import { supabaseAdmin } from "@/lib/supabase/client";
import { retryDiscoveryIngestionTask } from "@/lib/discovery/ingestion-queue";
import { buildDiscoveryOperationalAlerts, DISCOVERY_OPERATION_THRESHOLDS } from "@/lib/discovery/operations";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const db = () => supabaseAdmin as any;

export async function GET(request: NextRequest) {
  if (!hasCronAuthorization(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const database = db();
    const [tasks, oldest, failures, sources, recentRuns] = await Promise.all([
      database.from("discovery_ingestion_tasks").select("status"),
      database.from("discovery_ingestion_tasks").select("created_at").in("status", ["queued", "retry_wait"]).order("created_at", { ascending: true }).limit(1).maybeSingle(),
      database.from("discovery_scan_runs").select("provider,error,started_at,job_sources(company_name)").eq("status", "failed").order("started_at", { ascending: false }).limit(20),
      database.from("job_sources").select("id,company_name,provider,last_successful_scan_at,consecutive_failures,last_sync_error").eq("enabled", true).order("last_successful_scan_at", { ascending: true, nullsFirst: true }),
      database.from("discovery_scan_runs").select("source_id,status").order("started_at", { ascending: false }).limit(1000),
    ]);
    for (const response of [tasks, oldest, failures, sources, recentRuns]) if (response.error) throw response.error;
    const counts = (tasks.data || []).reduce((result: Record<string, number>, task: any) => {
      result[task.status] = (result[task.status] || 0) + 1;
      return result;
    }, {});
    const failuresByProvider = (failures.data || []).reduce((result: Record<string, number>, failure: any) => {
      result[failure.provider] = (result[failure.provider] || 0) + 1;
      return result;
    }, {});
    const sourceRunCounts = (recentRuns.data || []).reduce((result: Map<string, { total: number; succeeded: number }>, run: any) => {
      const current = result.get(run.source_id) || { total: 0, succeeded: 0 };
      current.total += 1;
      if (run.status === "succeeded") current.succeeded += 1;
      result.set(run.source_id, current);
      return result;
    }, new Map());
    const sourceHealth = (sources.data || []).map((source: any) => {
      const runs = sourceRunCounts.get(source.id);
      return {
        company: source.company_name,
        provider: source.provider,
        lastSuccessfulScanAt: source.last_successful_scan_at,
        recentSuccessRate: runs ? Number((runs.succeeded / runs.total).toFixed(3)) : null,
        recentRuns: runs?.total || 0,
        consecutiveFailures: source.consecutive_failures || 0,
        lastError: source.last_sync_error || null,
      };
    });
    const oldestQueuedAgeSeconds = oldest.data?.created_at ? Math.max(0, Math.floor((Date.now() - new Date(oldest.data.created_at).getTime()) / 1000)) : null;
    const alerts = buildDiscoveryOperationalAlerts({
      oldestQueuedAgeSeconds,
      failedTaskCount: counts.failed || 0,
      sources: sources.data || [],
    });
    return NextResponse.json({
      counts,
      oldestQueuedAt: oldest.data?.created_at || null,
      oldestQueuedAgeSeconds,
      thresholds: DISCOVERY_OPERATION_THRESHOLDS,
      alerts,
      failuresByProvider,
      recentSourceFailures: failures.data || [],
      sourceHealth,
      leastFreshEnabledSources: sourceHealth.slice(0, 20),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Queue status failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!hasCronAuthorization(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    if (!body?.taskId || typeof body.taskId !== "string") return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    return NextResponse.json({ retried: await retryDiscoveryIngestionTask(body.taskId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Retry failed" }, { status: 500 });
  }
}
