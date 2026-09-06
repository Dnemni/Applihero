import assert from "node:assert/strict";
import test from "node:test";
import { matchesCronAuthorization } from "../cron";

test("cron authorization supports a temporary previous secret during rotation", () => {
  assert.equal(matchesCronAuthorization("Bearer next", "next", "old"), true);
  assert.equal(matchesCronAuthorization("Bearer old", "next", "old"), true);
  assert.equal(matchesCronAuthorization("Bearer unknown", "next", "old"), false);
  assert.equal(matchesCronAuthorization(null, "next", "old"), false);
});
