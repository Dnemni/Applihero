export const DISCOVERY_OPERATION_THRESHOLDS = {
  queueAgeSeconds: 90 * 60,
  sourceFreshnessSeconds: 6 * 60 * 60,
  consecutiveFailures: 5,
  schedulerAgeSeconds: 10 * 60,
  enrichmentAgeSeconds: 6 * 60 * 60,
  rematchAgeSeconds: 2 * 60 * 60,
} as const;

export type DiscoveryOperationalAlert = {
  code: "queue_delayed" | "failed_tasks" | "stale_sources" | "repeated_source_failures" | "scheduler_stale" | "enrichment_delayed" | "enrichment_dead" | "rematch_stale";
  severity: "warning" | "critical";
  message: string;
  count?: number;
};

export function buildDiscoveryOperationalAlerts(input: {
  oldestQueuedAgeSeconds: number | null;
  failedTaskCount: number;
  schedulerAgeSeconds?: number | null;
  schedulerConfigured?: boolean;
  enrichmentOldestAgeSeconds?: number | null;
  enrichmentDeadCount?: number;
  rematchOldestAgeSeconds?: number | null;
  rematchNeverCount?: number;
  sources: Array<{ company_name: string; last_successful_scan_at: string | null; consecutive_failures?: number | null }>;
  now?: number;
}): DiscoveryOperationalAlert[] {
  const now = input.now ?? Date.now();
  const alerts: DiscoveryOperationalAlert[] = [];
  if (input.oldestQueuedAgeSeconds !== null && input.oldestQueuedAgeSeconds > DISCOVERY_OPERATION_THRESHOLDS.queueAgeSeconds) {
    alerts.push({ code: "queue_delayed", severity: "critical", message: "Discovery work has been waiting for more than 90 minutes.", count: input.oldestQueuedAgeSeconds });
  }
  if (input.failedTaskCount > 0) {
    alerts.push({ code: "failed_tasks", severity: "warning", message: `${input.failedTaskCount} historical task${input.failedTaskCount === 1 ? "" : "s"} need reconciliation or a manual retry.`, count: input.failedTaskCount });
  }
  if (input.schedulerConfigured === false || (input.schedulerAgeSeconds !== undefined && (input.schedulerAgeSeconds === null || input.schedulerAgeSeconds > DISCOVERY_OPERATION_THRESHOLDS.schedulerAgeSeconds))) {
    alerts.push({ code: "scheduler_stale", severity: "critical", message: "The Supabase discovery scheduler has not invoked a service route in the last ten minutes.", count: input.schedulerAgeSeconds ?? undefined });
  }
  if (input.enrichmentOldestAgeSeconds !== undefined && input.enrichmentOldestAgeSeconds !== null && input.enrichmentOldestAgeSeconds > DISCOVERY_OPERATION_THRESHOLDS.enrichmentAgeSeconds) {
    alerts.push({ code: "enrichment_delayed", severity: "warning", message: "Job-detail enrichment is more than six hours behind.", count: input.enrichmentOldestAgeSeconds });
  }
  if (Number(input.enrichmentDeadCount || 0) > 0) {
    alerts.push({ code: "enrichment_dead", severity: "warning", message: `${input.enrichmentDeadCount} job detail${input.enrichmentDeadCount === 1 ? " is" : "s are"} permanently unavailable.`, count: input.enrichmentDeadCount });
  }
  if (Number(input.rematchNeverCount || 0) > 0 || (input.rematchOldestAgeSeconds !== undefined && input.rematchOldestAgeSeconds !== null && input.rematchOldestAgeSeconds > DISCOVERY_OPERATION_THRESHOLDS.rematchAgeSeconds)) {
    alerts.push({ code: "rematch_stale", severity: "warning", message: "At least one subscribed user's stored scores are more than two hours behind.", count: input.rematchNeverCount || input.rematchOldestAgeSeconds || undefined });
  }
  const stale = input.sources.filter(source => !source.last_successful_scan_at || now - new Date(source.last_successful_scan_at).getTime() > DISCOVERY_OPERATION_THRESHOLDS.sourceFreshnessSeconds * 1_000);
  if (stale.length) alerts.push({ code: "stale_sources", severity: "critical", message: `${stale.length} enabled source${stale.length === 1 ? " is" : "s are"} older than six hours.`, count: stale.length });
  const repeating = input.sources.filter(source => Number(source.consecutive_failures || 0) >= DISCOVERY_OPERATION_THRESHOLDS.consecutiveFailures);
  if (repeating.length) alerts.push({ code: "repeated_source_failures", severity: "critical", message: `${repeating.length} source${repeating.length === 1 ? " has" : "s have"} failed five or more times in a row.`, count: repeating.length });
  return alerts;
}
