import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  const database = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  }) as any;
  const taskStatuses = ["queued", "running", "retry_wait", "failed", "succeeded"];
  const [operations, scheduler, taskCounts, recentFailures] = await Promise.all([
    database.rpc("get_discovery_operations_snapshot"),
    database.rpc("get_discovery_scheduler_health"),
    Promise.all(taskStatuses.map(async status => {
      const result = await database.from("discovery_ingestion_tasks").select("id", { count: "exact", head: true }).eq("status", status);
      if (result.error) throw result.error;
      return [status, result.count || 0];
    })),
    database.from("discovery_scan_runs").select("provider,error,metadata,started_at,job_sources(company_name)")
      .eq("status", "failed").order("started_at", { ascending: false }).limit(20),
  ]);
  for (const result of [operations, scheduler, recentFailures]) if (result.error) throw result.error;
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    taskCounts: Object.fromEntries(taskCounts),
    operations: operations.data,
    scheduler: scheduler.data,
    recentFailures: recentFailures.data || [],
  }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
