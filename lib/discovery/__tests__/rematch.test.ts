import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDisplayFit, selectRematchRows, type RematchRow } from "../rematch";

const currency = { matcherVersion: "v1", profileHash: "profile" };
function row(id: string, quickFit: Partial<RematchRow["quick_fit"]> | null, fitScore: number | null = 70, contentHash = "job"): RematchRow {
  return {
    discovery_job_id: id, source_id: "source", fit_score: fitScore, fit_band: "potential", eligibility_status: "unknown",
    quick_fit: quickFit as any,
    job: { id, content_hash: contentHash } as any,
  };
}
const current = { matcherVersion: "v1", evaluatedProfileHash: "profile", evaluatedJobHash: "job", discoveryEligible: true };

test("rematch selects only stale rows, highest stored score first, within the limit", () => {
  const rows = [
    row("current", current, 90),
    row("old-profile-low", { ...current, evaluatedProfileHash: "old" }, 20),
    row("old-profile-high", { ...current, evaluatedProfileHash: "old" }, 85),
    row("old-matcher", { ...current, matcherVersion: "v0" }, 60),
    row("edited-job", current, 55, "edited"),
    row("never-gated", { ...current, discoveryEligible: undefined }, 40),
    row("missing", null, null),
  ];
  const { selected, remaining } = selectRematchRows(rows, currency, 4);
  assert.deepEqual(selected.map(item => item.discovery_job_id), ["old-profile-high", "old-matcher", "edited-job", "never-gated"]);
  assert.equal(remaining, 2);
  const all = selectRematchRows(rows, currency, 100);
  assert.equal(all.selected.length, 6);
  assert.equal(all.remaining, 0);
  assert.ok(!all.selected.some(item => item.discovery_job_id === "current"));
});

test("display fit always carries deterministic currency and the discovery eligibility gate", () => {
  const fit = evaluateDisplayFit({
    id: "job", source_id: "source", title: "Senior Product Manager", company_name: "Example",
    description: "Five years of professional experience required.", content_hash: "job-hash", parsed_requirements: [],
  } as any, { background: "Bachelor student graduating in 2028", profileHash: "profile-hash" });
  assert.equal(fit.matcherVersion, "eligibility-evidence-v28");
  assert.equal(fit.evaluatedProfileHash, "profile-hash");
  assert.equal(fit.evaluatedJobHash, "job-hash");
  assert.equal(typeof fit.discoveryEligible, "boolean");
});
