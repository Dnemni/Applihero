import assert from "node:assert/strict";
import test from "node:test";
import { createRequestTimer, formatServerTimingSpan } from "../timing";

test("request timer records spans and renders a Server-Timing header", async () => {
  const timer = createRequestTimer();
  const value = await timer.time("candidates", async () => [1, 2, 3], rows => `${rows.length} rows`);
  assert.deepEqual(value, [1, 2, 3]);
  await assert.rejects(timer.time("failing", async () => { throw new Error("boom"); }));
  assert.equal(timer.spans.length, 2);
  assert.equal(timer.spans[1].detail, "error");
  const header = timer.header();
  assert.match(header, /^candidates;dur=\d+\.\d;desc="3 rows", failing;dur=\d+\.\d;desc="error", total;dur=\d+\.\d$/);
});

test("span names and descriptions are header safe", () => {
  assert.equal(formatServerTimingSpan({ name: "all roles/page", ms: 12.34, detail: 'say "hi"' }), `all_roles_page;dur=12.3;desc="say 'hi'"`);
});
