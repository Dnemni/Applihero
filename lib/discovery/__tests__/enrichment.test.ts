import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { classifyEnrichmentFailure, drainEnrichmentWith, enrichmentAttempt } from "../enrichment";

test("enrichment counts charged claims once while supporting the previous claim RPC", () => {
  assert.equal(enrichmentAttempt({ attempts: 3, claimed_attempt: 3 }), 3);
  assert.equal(enrichmentAttempt({ attempts: 3 }), 4);
});

test("enrichment classifies permanent and retryable provider failures", () => {
  assert.deepEqual(classifyEnrichmentFailure(new Error("Workday careers source returned 403")), {
    message: "Workday careers source returned 403",
    retryable: false,
    kind: "permanent",
  });
  assert.equal(classifyEnrichmentFailure(new Error("Workday careers source returned 429")).retryable, true);
  assert.equal(classifyEnrichmentFailure(new Error("Workday careers source returned 503")).retryable, true);
  assert.equal(classifyEnrichmentFailure(new Error("Job detail is unavailable")).kind, "unavailable");
});

test("enrichment migration caps claims and separates retry from terminal failure", () => {
  const migration = readFileSync("supabase/migrations/20260906000000_harden_discovery_enrichment_queue.sql", "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS max_attempts/);
  assert.match(migration, /'retry_wait', 'dead'/);
  assert.match(migration, /queue\.attempts < queue\.max_attempts/);
  assert.match(migration, /queue\.status = 'processing' AND queue\.locked_at < NOW\(\) - INTERVAL '10 minutes'/);
  assert.match(migration, /reconcile_discovery_enrichment_queue/);
});

test("enrichment drain stops on its time budget and aggregates outcomes", async () => {
  const times = [0, 0, 30, 60];
  let calls = 0;
  const result = await drainEnrichmentWith(async () => {
    calls += 1;
    return { processed: 4, completed: 2, retried: 1, dead: 1, failed: 2, unavailable: false };
  }, { budgetMs: 50, maxItems: 40, now: () => times.shift() ?? 60 });
  assert.equal(calls, 2);
  assert.deepEqual(result, {
    processed: 8,
    completed: 4,
    retried: 2,
    dead: 2,
    exhaustedCapacity: false,
    exhaustedBudget: true,
    unavailable: false,
  });
});
