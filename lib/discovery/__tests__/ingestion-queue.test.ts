import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { drainWith, hourlyBucket, retryDelaySeconds } from "../ingestion-queue";

test("hourly task bucket is stable across duplicate dispatcher calls", () => {
  const first = hourlyBucket(new Date("2026-08-27T13:59:59.999Z"));
  const second = hourlyBucket(new Date("2026-08-27T13:00:00.001Z"));
  assert.equal(first, "2026-08-27T13:00:00.000Z");
  assert.equal(first, second);
});

test("retry backoff is bounded and increases by attempt", () => {
  const first = retryDelaySeconds(1);
  const later = retryDelaySeconds(4);
  const capped = retryDelaySeconds(99);
  assert.ok(first >= 300 && first < 330);
  assert.ok(later >= 2400 && later < 2430);
  assert.ok(capped >= 3600 && capped < 3630);
});

test("queue drain stops before another claim when its wall-clock budget is exhausted", async () => {
  let clock = 0;
  let calls = 0;
  const result = await drainWith(async () => {
    calls += 1;
    clock += 60;
    return { claimed: 1, completed: 1, retried: 0, failed: 0, deferred: 0, results: [] };
  }, { budgetMs: 100, now: () => clock, idlePause: async () => undefined });
  assert.equal(calls, 2);
  assert.equal(result.claimed, 2);
  assert.equal(result.exhaustedBudget, true);
  assert.equal(result.exhaustedCapacity, false);
});

test("queue migration enforces idempotency and atomic concurrent claims", async () => {
  const migration = await readFile(new URL("../../../supabase/migrations/20260827000000_add_discovery_ingestion_task_queue.sql", import.meta.url), "utf8");
  assert.match(migration, /UNIQUE\(source_id, scheduled_for\)/);
  assert.match(migration, /enqueue_discovery_ingestion_hour/);
  assert.match(migration, /ON CONFLICT \(source_id, scheduled_for\) DO NOTHING/);
  assert.match(migration, /claim_discovery_ingestion_tasks/);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
  assert.match(migration, /finish_discovery_ingestion_task/);
  assert.match(migration, /lease_token = p_lease_token/);
});

test("operational migration reconciles superseded failed tasks without deleting their audit rows", async () => {
  const migration = await readFile(new URL("../../../supabase/migrations/20260902000000_harden_discovery_queue_operations.sql", import.meta.url), "utf8");
  assert.match(migration, /reconcile_discovery_ingestion_tasks/);
  assert.match(migration, /task\.status IN \('queued', 'retry_wait', 'failed'\)/);
  assert.match(migration, /source\.last_successful_scan_at >= task\.scheduled_for/);
  assert.match(migration, /'reconciled', TRUE/);
});

test("source task lease migration defers collisions without consuming attempts", async () => {
  const migration = await readFile(new URL("../../../supabase/migrations/20260906010000_add_discovery_source_task_leases.sql", import.meta.url), "utf8");
  assert.match(migration, /acquire_discovery_source_lease/);
  assert.match(migration, /scan_locked_until IS NULL OR source\.scan_locked_until < NOW\(\)/);
  assert.match(migration, /attempts = GREATEST\(0, task\.attempts - 1\)/);
  assert.match(migration, /task\.lease_token = p_lease_token/);
  assert.match(migration, /reconcile_discovery_source_tasks/);
});
