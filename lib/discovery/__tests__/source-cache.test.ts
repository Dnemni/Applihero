import test from "node:test";
import assert from "node:assert/strict";
import { loadObservedSourceCache } from "../source-cache";

test("source cache fetches only observed IDs in bounded pages and excludes raw payloads", async () => {
  const calls: string[][] = [];
  const database = { from(table: string) {
    assert.equal(table, "discovery_jobs");
    return { select(fields: string) {
      assert.ok(!fields.includes("raw_payload") && !fields.includes("*"));
      if (!fields.includes("description")) assert.ok(fields.includes("bootstrap_observed"));
      return { eq(field: string, value: string) {
        assert.equal(field, "source_id"); assert.equal(value, "company");
        return { async in(_field: string, ids: string[]) {
          calls.push(ids);
          return { data: ids.map(id => ({ source_job_id: id, ...(fields.includes("description") ? { description: "cached body" } : {}) })), error: null };
        } };
      } };
    } };
  } };
  const ids = Array.from({ length: 101 }, (_, i) => String(i));
  const result = await loadObservedSourceCache(database, "company", [...ids, "0"], true);
  assert.deepEqual(calls.map(batch => batch.length), [50, 50, 1, 50, 50, 1]);
  assert.equal(result.size, 101);
  assert.equal(result.get("100").description, "cached body");
  calls.length = 0;
  const fullFeed = await loadObservedSourceCache(database, "company", ids, true, []);
  assert.deepEqual(calls.map(batch => batch.length), [50, 50, 1]);
  assert.equal(fullFeed.get("0").description, undefined);
  calls.length = 0;
  await loadObservedSourceCache(database, "company", [], true);
  assert.equal(calls.length, 0);
});
