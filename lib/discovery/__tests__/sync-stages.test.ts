import assert from "node:assert/strict";
import test from "node:test";
import { discoverySyncStageError } from "../sync";

test("source sync errors preserve one actionable stage label", () => {
  const staged = discoverySyncStageError("persist_catalog_jobs", { message: "canceling statement due to statement timeout" });
  assert.equal(staged.message, "[persist_catalog_jobs] canceling statement due to statement timeout");
  assert.equal(discoverySyncStageError("outer_stage", staged), staged);
});
