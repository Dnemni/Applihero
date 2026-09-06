import test from "node:test";
import assert from "node:assert/strict";
import { eligibleDigestJobs, selectDigestNotifications } from "../digest-policy";

const location = { preferredCountry: "US", preferredRegions: [], locationScope: "country" as const, includeRemote: true };
const row = (id: string, overrides: any = {}) => ({ source_id: "followed", fit_score: 80, fit_band: "strong", eligibility_status: "aligned", discovery_eligible: "true",
  discovery_jobs: { id, title: id, status: "open", location: "New York, NY, USA", source_published_at: "2026-09-01" }, ...overrides });

test("digest retains all eligible roles beyond ten, and respects present follows, geography and eligibility", () => {
  const rows = Array.from({ length: 25 }, (_, i) => row(String(i)));
  rows.push(row("foreign", { discovery_jobs: { id: "foreign", status: "open", location: "Berlin, Germany" } }),
    row("unfollowed", { source_id: "other" }), row("conflict", { eligibility_status: "conflict" }),
    row("gate", { discovery_eligible: "false" }), row("low", { fit_score: 49 }),
    row("closed", { discovery_jobs: { id: "closed", status: "closed", location: "USA" } }));
  const jobs = eligibleDigestJobs(rows, [{ source_id: "followed", min_fit_score: 60 }], 50, location);
  assert.equal(jobs.length, 25);
  assert.ok(jobs.every(job => /^\d+$/.test(job.id)));
});

test("digest batching never acknowledges half a notification", () => {
  const notifications = Array.from({ length: 5 }, (_, n) => ({ id: String(n), job_ids: Array.from({ length: 30 }, (_, j) => `${n}-${j}`) }));
  const selected = selectDigestNotifications(notifications);
  assert.equal(selected.jobIds.length, 90);
  assert.deepEqual(selected.notifications.map(row => row.id), ["0", "1", "2"]);
  assert.equal(selected.hasMore, true);
  assert.throws(() => selectDigestNotifications([{ id: "oversized", job_ids: Array.from({ length: 101 }, (_, i) => String(i)) }]));
});
