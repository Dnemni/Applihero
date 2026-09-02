export const DISCOVERY_OPERATION_THRESHOLDS = {
  queueAgeSeconds: 90 * 60,
  sourceFreshnessSeconds: 6 * 60 * 60,
  consecutiveFailures: 5,
} as const;

export type DiscoveryOperationalAlert = {
  code: "queue_delayed" | "failed_tasks" | "stale_sources" | "repeated_source_failures";
  severity: "warning" | "critical";
  message: string;
  count?: number;
};

export function buildDiscoveryOperationalAlerts(input: {
  oldestQueuedAgeSeconds: number | null;
  failedTaskCount: number;
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
  const stale = input.sources.filter(source => !source.last_successful_scan_at || now - new Date(source.last_successful_scan_at).getTime() > DISCOVERY_OPERATION_THRESHOLDS.sourceFreshnessSeconds * 1_000);
  if (stale.length) alerts.push({ code: "stale_sources", severity: "critical", message: `${stale.length} enabled source${stale.length === 1 ? " is" : "s are"} older than six hours.`, count: stale.length });
  const repeating = input.sources.filter(source => Number(source.consecutive_failures || 0) >= DISCOVERY_OPERATION_THRESHOLDS.consecutiveFailures);
  if (repeating.length) alerts.push({ code: "repeated_source_failures", severity: "critical", message: `${repeating.length} source${repeating.length === 1 ? " has" : "s have"} failed five or more times in a row.`, count: repeating.length });
  return alerts;
}
