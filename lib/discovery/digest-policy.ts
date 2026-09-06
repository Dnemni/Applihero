import { matchesDiscoveryLocation, type DiscoveryLocationPreferences } from "./location";

export function selectDigestNotifications(rows: Array<{ id: string; job_ids: string[] }>, maxJobs = 100) {
  const selected: typeof rows = [];
  const ids = new Set<string>();
  for (const row of rows) {
    const next = new Set([...ids, ...(row.job_ids || [])]);
    if (next.size > maxJobs) {
      if (!selected.length) throw new Error("Notification exceeds digest capacity; leave pending for review");
      break;
    }
    selected.push(row);
    for (const id of next) ids.add(id);
  }
  return { notifications: selected, jobIds: [...ids], hasMore: selected.length < rows.length };
}

export function eligibleDigestJobs(rows: any[], subscriptions: Array<{ source_id: string; min_fit_score: number }>, minimum: number, location: DiscoveryLocationPreferences) {
  const followed = new Map(subscriptions.map(row => [row.source_id, row.min_fit_score]));
  const jobs = new Map<string, any>();
  for (const row of rows) {
    const job = Array.isArray(row.discovery_jobs) ? row.discovery_jobs[0] : row.discovery_jobs;
    if (!job || !followed.has(row.source_id) || job.status !== "open" || row.fit_score == null ||
        row.fit_score < Math.max(minimum, followed.get(row.source_id) || 0) ||
        row.fit_band === "likely_conflict" || row.eligibility_status === "conflict" ||
        row.discovery_eligible === "false" || !matchesDiscoveryLocation(job, location)) continue;
    jobs.set(job.id, job);
  }
  return [...jobs.values()].sort((a, b) =>
    new Date(b.source_published_at || 0).getTime() - new Date(a.source_published_at || 0).getTime() || a.id.localeCompare(b.id));
}
