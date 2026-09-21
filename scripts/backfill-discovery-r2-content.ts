import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Copies existing job bodies to R2 without deleting anything from Supabase.
 * It is idempotent: rows change state only after their immutable R2 revision
 * has been written. Start with --dry-run before the real copy.
 *
 * Usage: npm run backfill:discovery-r2-content -- --dry-run
 *        npm run backfill:discovery-r2-content -- --batch 25 --concurrency 4
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const argument = (name: string, fallback: string) => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
  };
  const batch = Math.max(1, Math.min(100, Number(argument("batch", "25")) || 25));
  const concurrency = Math.max(1, Math.min(8, Number(argument("concurrency", "4")) || 4));
  const { createClient } = await import("@supabase/supabase-js");
  const { storeDiscoveryJobContent } = await import("../lib/discovery/content-store");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const database = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) as any;

  const schemaProbe = await database.from("discovery_jobs").select("content_storage,content_ref").limit(1);
  if (schemaProbe.error) {
    throw new Error(`Apply supabase/migrations/20260921000000_add_discovery_r2_content_refs.sql first: ${schemaProbe.error.message}`);
  }

  if (dryRun) {
    const { count, error } = await database.from("discovery_jobs")
      .select("id", { count: "exact", head: true }).eq("content_storage", "supabase");
    if (error) throw error;
    console.log({ dryRun: true, pendingRows: count || 0, note: "No descriptions or raw provider payloads were read." });
    return;
  }

  let copied = 0;
  let failures = 0;
  while (true) {
    // Always read the first pending page: successful writes remove rows from
    // this predicate, so an offset would skip work.
    const { data, error } = await database.from("discovery_jobs")
      .select("id,content_hash,description,description_html,raw_payload")
      .eq("content_storage", "supabase")
      .order("updated_at", { ascending: true })
      .limit(batch);
    if (error) throw error;
    if (!data?.length) break;

    for (let index = 0; index < data.length; index += concurrency) {
      const group = data.slice(index, index + concurrency);
      const results = await Promise.all(group.map(async (job: any) => {
        try {
          const stored = await storeDiscoveryJobContent({
            jobId: job.id,
            contentHash: job.content_hash,
            content: {
              description: job.description || "",
              description_html: job.description_html || null,
              raw_payload: job.raw_payload || {},
            },
          });
          if (!stored) throw new Error("Cloudflare R2 discovery-content credentials are incomplete");
          const { data: updatedRows, error: updateError } = await database.from("discovery_jobs").update({
            content_storage: stored.storage,
            content_ref: stored.ref,
            content_bytes: stored.bytes,
            content_stored_at: stored.storedAt,
          }).eq("id", job.id).eq("content_storage", "supabase").select("id");
          if (updateError) throw updateError;
          if (!updatedRows?.length) throw new Error("Job changed during copy; rerun to copy its newest revision");
          return true;
        } catch (error) {
          console.error(`Could not copy discovery job ${job.id}:`, error instanceof Error ? error.message : error);
          return false;
        }
      }));
      copied += results.filter(Boolean).length;
      failures += results.filter(result => !result).length;
    }
    console.log({ copied, failures, remainingPage: data.length });
    if (failures) throw new Error("Stopped after an R2 copy failure; rerun safely after correcting the reported error.");
  }
  console.log({ copied, failures, complete: true });
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
