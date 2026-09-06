// Cache hydration follows the provider's bounded scan window. Never download
// every stored description merely to build the known-ID frontier.
export async function loadObservedSourceCache(database: any, sourceId: string, sourceJobIds: string[], ingestionState: boolean) {
  const ids = [...new Set(sourceJobIds)];
  const fields = "source_job_id,description,description_html,workplace_type,employment_type,parser_version,content_hash,status" +
    (ingestionState ? ",listing_hash,bootstrap_observed" : "");
  const rows = new Map<string, any>();
  for (let index = 0; index < ids.length; index += 50) {
    const { data, error } = await database.from("discovery_jobs").select(fields)
      .eq("source_id", sourceId).in("source_job_id", ids.slice(index, index + 50));
    if (error) throw error;
    for (const row of data || []) rows.set(String(row.source_job_id), row);
  }
  return rows;
}
