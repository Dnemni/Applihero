import assert from "node:assert/strict";
import test from "node:test";
import { buildDiscoveryOperationalAlerts } from "../operations";

test("operational thresholds flag stale queue work and repeated source failures", () => {
  const now = Date.parse("2026-09-02T12:00:00Z");
  const alerts = buildDiscoveryOperationalAlerts({
    oldestQueuedAgeSeconds: 91 * 60,
    failedTaskCount: 1,
    now,
    sources: [
      { company_name: "Old Source", last_successful_scan_at: "2026-09-02T05:59:00Z", consecutive_failures: 5 },
      { company_name: "Healthy Source", last_successful_scan_at: "2026-09-02T11:59:00Z", consecutive_failures: 0 },
    ],
  });
  assert.deepEqual(alerts.map(alert => alert.code), ["queue_delayed", "failed_tasks", "stale_sources", "repeated_source_failures"]);
});
