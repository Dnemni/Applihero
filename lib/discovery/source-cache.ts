// Cache hydration follows the provider's bounded scan window. Never download
// every stored description merely to build the known-ID frontier.
export async function loadObservedSourceCache(database: any, sourceId: string, sourceJobIds: string[], ingestionState: boolean, bodySourceJobIds: string[] = sourceJobIds) {
  const ids = [...new Set(sourceJobIds)];
  const fields = "source_job_id,workplace_type,employment_type,parser_version,content_hash,status" +
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
  return rows;
}
