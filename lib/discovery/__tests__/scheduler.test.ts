import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Supabase scheduler uses Vault and only allowlisted service routes", async () => {
  const migration = await readFile(new URL("../../../supabase/migrations/20260906020000_add_discovery_scheduler.sql", import.meta.url), "utf8");
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.doesNotMatch(migration, /Bearer [A-Za-z0-9_-]{20,}/);
  assert.match(migration, /Unsupported discovery service route/);
  assert.match(migration, /applihero-discovery-dispatch/);
  assert.match(migration, /applihero-discovery-source-a/);
  assert.match(migration, /applihero-discovery-source-b/);
  assert.match(migration, /applihero-discovery-enrichment-even/);
  assert.match(migration, /applihero-discovery-maintenance/);
  assert.match(migration, /get_discovery_scheduler_health/);
});
