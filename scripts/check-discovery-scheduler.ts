import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  const database = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await database.rpc("get_discovery_scheduler_health");
  if (error) throw new Error(`Apply the discovery scheduler migration first: ${error.message}`);
  console.log(JSON.stringify(data, null, 2));
  if (!data?.configured) throw new Error("Discovery scheduler Vault secrets are not configured");
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  if (jobs.length !== 6 || jobs.some((job: any) => job.active !== true)) {
    throw new Error(`Expected six active discovery scheduler jobs; found ${jobs.length}`);
  }
  const recent = Array.isArray(data.recentInvocations) ? data.recentInvocations : [];
  if (recent.some((item: any) => item.configurationError)) throw new Error("A recent scheduler invocation has a configuration error");
  if (recent.some((item: any) => item.statusCode && (item.statusCode < 200 || item.statusCode >= 300))) {
    throw new Error("A recent scheduler invocation returned a non-2xx response");
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
