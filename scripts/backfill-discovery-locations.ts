import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Populates `location_countries`, `location_remote`, and
 * `location_classifier_version` for catalog rows written before the
 * 20260904 migration or by an older classifier. Idempotent and resumable:
 * only rows whose classifier version differs are touched.
 *
 * Usage: npx tsx scripts/backfill-discovery-locations.ts [--dry-run] [--batch 200] [--status open|all]
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const arg = (name: string, fallback: string) => { const index = process.argv.indexOf(`--${name}`); return index >= 0 ? process.argv[index + 1] : fallback; };
  const batch = Math.max(50, Math.min(500, Number(arg("batch", "200")) || 200));
  const status = arg("status", "open");
  const { createClient } = await import("@supabase/supabase-js");
  const { classifyDiscoveryLocation, LOCATION_CLASSIFIER_VERSION } = await import("../lib/discovery/location");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;

  const probe = await db.from("discovery_jobs").select("location_classifier_version").limit(1);
  if (probe.error) throw new Error(`Apply supabase/migrations/20260904000000_add_discovery_location_columns.sql first: ${probe.error.message}`);

  let processed = 0, updated = 0, page = 0;
  const countries = new Map<string, number>();
  let remote = 0, unknown = 0;
  // Rows already at the current version are excluded, so each pass shrinks the
  // remaining set; reading from offset 0 every time avoids skipping rows that
  // moved when earlier pages were updated.
  while (true) {
    let query = db.from("discovery_jobs")
      .select("id,source_id,source_job_id,company_name,title,source_url,apply_url,content_hash,location,workplace_type")
      .or(`location_classifier_version.is.null,location_classifier_version.neq.${LOCATION_CLASSIFIER_VERSION}`)
      .order("id", { ascending: true })
      .range(dryRun ? page * batch : 0, (dryRun ? page * batch : 0) + batch - 1);
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    const rows = data.map((job: any) => {
      const classification = classifyDiscoveryLocation(job.location, job.workplace_type);
      for (const code of classification.countries) countries.set(code, (countries.get(code) || 0) + 1);
      if (classification.remote) remote += 1;
      if (!classification.countries.length && !classification.remote) unknown += 1;
      return {
        id: job.id, source_id: job.source_id, source_job_id: job.source_job_id, company_name: job.company_name, title: job.title,
        source_url: job.source_url, apply_url: job.apply_url, content_hash: job.content_hash,
        location_countries: classification.countries,
        location_remote: classification.remote,
        location_classifier_version: LOCATION_CLASSIFIER_VERSION,
      };
    });
    processed += rows.length;
    if (!dryRun) {
      const { error: writeError } = await db.from("discovery_jobs").upsert(rows, { onConflict: "id" });
      if (writeError) throw writeError;
      updated += rows.length;
    }
    page += 1;
    if (page % 10 === 0) console.log(`processed ${processed}${dryRun ? " (dry run)" : ""}`);
    if (data.length < batch) break;
  }
  const top = Array.from(countries.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log({ processed, updated, dryRun, remote, unknown, topCountries: Object.fromEntries(top) });
}

main().catch(error => { console.error(error); process.exit(1); });
