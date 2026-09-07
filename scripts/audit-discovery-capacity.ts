import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is required");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("get_discovery_capacity_snapshot");
  if (error) console.error("Capacity RPC unavailable; apply 20260906060000 first:", error.message);
  else console.log(JSON.stringify(data, null, 2));
  // Explicit opt-in: only 15 catalog rows maximum. Prints byte counts, never
  // raw payloads or user data. This is a sample, not a billing extrapolation.
  if (process.argv.includes("--sample")) {
    for (const provider of ["greenhouse", "workday", "jibe"]) {
      const source = await db.from("job_sources").select("id,company_name").eq("provider", provider).eq("enabled", true).limit(1).maybeSingle();
      if (source.error) throw source.error;
      if (!source.data) continue;
      const sample = await db.from("discovery_jobs").select("*").eq("source_id", source.data.id).limit(5);
      if (sample.error) throw sample.error;
      const rows = sample.data || [];
      const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
      console.log(JSON.stringify({ provider, company: source.data.company_name, sampled: rows.length,
        fullRowBytes: bytes(rows), frontierBytes: bytes(rows.map(row => ({ source_job_id: row.source_job_id }))),
        observedCacheBytes: bytes(rows.map(row => Object.fromEntries(
          ["source_job_id","description","description_html","workplace_type","employment_type","parser_version","content_hash","status","listing_hash","bootstrap_observed"].map(field => [field,row[field]])
        ))),
      }));
    }
  }
  if (error) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
