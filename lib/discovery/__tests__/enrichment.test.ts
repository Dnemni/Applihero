import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { classifyEnrichmentFailure } from "../enrichment";

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
  assert.match(migration, /reconcile_discovery_enrichment_queue/);
});
