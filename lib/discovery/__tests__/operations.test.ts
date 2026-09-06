import assert from "node:assert/strict";
import test from "node:test";
import { buildDiscoveryOperationalAlerts } from "../operations";

test("operational thresholds flag stale queue work and repeated source failures", () => {
  const now = Date.parse("2026-09-02T12:00:00Z");
  const alerts = buildDiscoveryOperationalAlerts({
    oldestQueuedAgeSeconds: 91 * 60,
    failedTaskCount: 1,
    schedulerAgeSeconds: 11 * 60,
    schedulerConfigured: true,
    enrichmentOldestAgeSeconds: 7 * 60 * 60,
    enrichmentDeadCount: 3,
    rematchOldestAgeSeconds: 3 * 60 * 60,
    rematchNeverCount: 0,
    now,
    sources: [
      { company_name: "Old Source", last_successful_scan_at: "2026-09-02T05:59:00Z", consecutive_failures: 5 },
      { company_name: "Healthy Source", last_successful_scan_at: "2026-09-02T11:59:00Z", consecutive_failures: 0 },
    ],
  });
  assert.deepEqual(alerts.map(alert => alert.code), ["queue_delayed", "failed_tasks", "scheduler_stale", "enrichment_delayed", "enrichment_dead", "rematch_stale", "stale_sources", "repeated_source_failures"]);
});

test("operations snapshot performs exact database-side lifecycle aggregation", async () => {
  const { readFile } = await import("node:fs/promises");
  const migration = await readFile(new URL("../../../supabase/migrations/20260906030000_add_discovery_operations_snapshot.sql", import.meta.url), "utf8");
  assert.match(migration, /supersededTaskCount/);
  assert.match(migration, /enrichmentCounts/);
  assert.match(migration, /neverRematchedUsers/);
  assert.match(migration, /count\(\*\)/);
});
