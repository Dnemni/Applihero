import assert from "node:assert/strict";
import test from "node:test";
import { clampFeedLimit, clampFeedOffset, comparePublishedDesc, selectMatchPage, type MatchCandidate } from "../feed";

const currency = { matcherVersion: "v1", profileHash: "profile" };
function candidate(id: string, overrides: Omit<Partial<MatchCandidate>, "job"> & { job?: Partial<MatchCandidate["job"]> } = {}): MatchCandidate {
  return {
    discovery_job_id: id,
    source_id: "followed",
    fit_score: 80,
    fit_band: "strong",
    eligibility_status: "aligned",
    evaluated_profile_hash: "profile",
    evaluated_matcher_version: "v1",
    evaluated_job_hash: "job",
    ...overrides,
    job: { id, source_published_at: "2026-09-01T00:00:00Z", location: "New York, NY, United States", workplace_type: "hybrid", content_hash: "job", ...overrides.job },
  };
}
const usCountry = { preferredCountry: "US", preferredRegions: [], locationScope: "country" as const, includeRemote: true };

test("match page counts every qualifying row and exposes the next offset", () => {
  const rows = Array.from({ length: 120 }, (_, index) => candidate(`job-${index}`));
  const first = selectMatchPage(rows, { location: usCountry, offset: 0, limit: 50, currency });
  assert.equal(first.total, 120);
  assert.equal(first.ids.length, 50);
  assert.equal(first.nextOffset, 50);
  const last = selectMatchPage(rows, { location: usCountry, offset: 100, limit: 50, currency });
  assert.equal(last.ids.length, 20);
  assert.equal(last.nextOffset, null);
  assert.deepEqual(last.ids.slice(0, 2), ["job-100", "job-101"]);
});

test("match page applies followed sources, score threshold, conflicts, and strict location", () => {
  const rows = [
    candidate("keep"),
    candidate("unfollowed", { source_id: "other" }),
    candidate("fifty", { fit_score: 50 }),
    candidate("conflict-band", { fit_band: "likely_conflict" }),
    candidate("conflict-eligibility", { eligibility_status: "conflict" }),
    candidate("berlin", { job: { location: "Berlin, Germany" } }),
    candidate("remote", { job: { location: "Remote", workplace_type: "remote" } }),
    candidate("potential", { fit_score: 60, fit_band: "potential" }),
  ];
  const page = selectMatchPage(rows, { sourceIds: new Set(["followed"]), location: usCountry, offset: 0, limit: 50, currency });
  assert.deepEqual(page.ids, ["keep", "remote", "potential"]);
  assert.equal(page.total, 3);
  assert.equal(page.strong, 2);
  const noRemote = selectMatchPage(rows, { sourceIds: new Set(["followed"]), location: { ...usCountry, includeRemote: false }, offset: 0, limit: 50, currency });
  assert.deepEqual(noRemote.ids, ["keep", "potential"]);
});

test("stale count reflects rows whose stored hashes no longer match without dropping them", () => {
  const rows = [
    candidate("current"),
    candidate("old-profile", { evaluated_profile_hash: "previous" }),
    candidate("old-matcher", { evaluated_matcher_version: "v0" }),
    candidate("changed-job", { job: { content_hash: "edited" } }),
  ];
  const page = selectMatchPage(rows, { location: usCountry, offset: 0, limit: 50, currency });
  assert.equal(page.total, 4);
  assert.equal(page.stale, 3);
});

test("offsets and limits are clamped and unknown dates sort last", () => {
  assert.equal(clampFeedOffset("-5"), 0);
  assert.equal(clampFeedOffset("50"), 50);
  assert.equal(clampFeedOffset("abc"), 0);
  assert.equal(clampFeedLimit("5"), 10);
  assert.equal(clampFeedLimit("500"), 100);
  assert.equal(clampFeedLimit(null), 50);
  const sorted = [
    { id: "b", source_published_at: null },
    { id: "a", source_published_at: "2026-09-01T00:00:00Z" },
    { id: "c", source_published_at: "2026-09-02T00:00:00Z" },
    { id: "a2", source_published_at: "2026-09-01T00:00:00Z" },
  ].sort(comparePublishedDesc).map(item => item.id);
  assert.deepEqual(sorted, ["c", "a", "a2", "b"]);
});
