import { config } from "dotenv";

config({ path: ".env.local" });

async function mapPool<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) await work(items[cursor++]);
  }));
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { hashText, parseJobRequirements, REQUIREMENTS_PARSER_VERSION } = await import("../lib/discovery/parser");
  const database = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const requestedJob = process.argv.find(value => value.startsWith("--job="))?.slice("--job=".length);
  const requestedLimit = Number(process.argv.find(value => value.startsWith("--limit="))?.slice("--limit=".length) || 0);
  const pageSize = 500;
  let updated = 0;
  const started = Date.now();
  while (!requestedLimit || updated < requestedLimit) {
    const batchLimit = requestedLimit ? Math.min(pageSize, requestedLimit - updated) : pageSize;
    let query = database.from("discovery_jobs")
      .select("id,title,description,location,source_updated_at,parser_version,content_hash")
      .neq("parser_version", REQUIREMENTS_PARSER_VERSION)
      .order("id")
      .range(0, batchLimit - 1);
    if (requestedJob) query = query.eq("id", requestedJob);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    await mapPool(data, 20, async job => {
      const parsedRequirements = parseJobRequirements(job.description || "");
      const contentHash = hashText(JSON.stringify({
        title: job.title,
        description: job.description || "",
        location: job.location,
        updatedAt: job.source_updated_at,
        parserVersion: REQUIREMENTS_PARSER_VERSION,
      }));
      const { error: updateError } = await database.from("discovery_jobs").update({
        parsed_requirements: parsedRequirements,
        parser_version: REQUIREMENTS_PARSER_VERSION,
        content_hash: contentHash,
      }).eq("id", job.id);
      if (updateError) throw updateError;
      updated += 1;
    });
    if (updated % 2_000 === 0) console.log(JSON.stringify({ event: "progress", updated }));
    if (requestedJob) break;
  }
  console.log(JSON.stringify({ parserVersion: REQUIREMENTS_PARSER_VERSION, updated, durationMs: Date.now() - started }));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
