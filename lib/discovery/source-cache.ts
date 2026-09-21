// Cache hydration follows the provider's bounded scan window. Never download
// every stored description merely to build the known-ID frontier.
import { loadDiscoveryJobContent } from "./content-store";

export async function loadObservedSourceCache(database: any, sourceId: string, sourceJobIds: string[], ingestionState: boolean, bodySourceJobIds: string[] = sourceJobIds, supportsR2Content = false) {
  const ids = [...new Set(sourceJobIds)];
  const fields = "source_job_id,workplace_type,employment_type,parser_version,content_hash,status" +
    (supportsR2Content ? ",content_storage,content_ref" : "") +
    (ingestionState ? ",listing_hash,bootstrap_observed" : "");
  const rows = new Map<string, any>();
  for (let index = 0; index < ids.length; index += 50) {
    const { data, error } = await database.from("discovery_jobs").select(fields)
      .eq("source_id", sourceId).in("source_job_id", ids.slice(index, index + 50));
    if (error) throw error;
    for (const row of data || []) rows.set(String(row.source_job_id), row);
  }
  const observed = new Set(ids);
  const bodies = [...new Set(bodySourceJobIds)].filter(id => observed.has(id) && rows.has(id));
  for (let index = 0; index < bodies.length; index += 50) {
    const { data, error } = await database.from("discovery_jobs").select("source_job_id,description,description_html")
      .eq("source_id", sourceId).in("source_job_id", bodies.slice(index, index + 50));
    if (error) throw error;
    for (const row of data || []) rows.set(String(row.source_job_id), { ...rows.get(String(row.source_job_id)), ...row });
  }
  // Once backfilled, a list-only provider needs a body only for the specific
  // observed roles that lack one in its current response. Never fan this out
  // to the whole source catalog.
  for (const sourceJobId of bodies) {
    const row = rows.get(String(sourceJobId));
    if (!row || row.description || row.content_storage !== "r2" || !row.content_ref) continue;
    const content = await loadDiscoveryJobContent(row.content_ref);
    if (content) rows.set(String(sourceJobId), { ...row, ...content });
  }
  return rows;
}
