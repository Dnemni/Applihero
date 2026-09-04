import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, isQuickFitCurrent, qualifiesAsMatch, quickFitEquals } from "../fit-cache";
import { answersToMatchingContext } from "../facts";

test("canonical JSON ignores key order and undefined members", () => {
  const fromDatabase = { band: "strong", label: "Strong", score: 82, eligibility: { label: "Aligned", status: "aligned", reasons: ["a", "b"] } };
  const fromMatcher = { score: 82, band: "strong", label: "Strong", eligibility: { status: "aligned", label: "Aligned", reasons: ["a", "b"] }, extra: undefined };
  assert.equal(canonicalJson(fromDatabase), canonicalJson(fromMatcher));
  assert.ok(quickFitEquals(fromDatabase, fromMatcher));
  assert.ok(!quickFitEquals(fromDatabase, { ...fromMatcher, score: 81 }));
  assert.ok(!quickFitEquals({ eligibility: { reasons: ["a", "b"] } }, { eligibility: { reasons: ["b", "a"] } }), "array order is meaningful");
});

test("stored fit is current only when matcher version, profile hash, job hash, and gate are all present", () => {
  const stored = { matcherVersion: "v1", evaluatedProfileHash: "p", evaluatedJobHash: "j", discoveryEligible: true, score: 60, band: "potential" as const, label: "", reasons: [], supportedCount: 0, requirementCount: 0, eligibility: { status: "unknown" as const, label: "", reasons: [] } };
  assert.ok(isQuickFitCurrent(stored, { matcherVersion: "v1", profileHash: "p", jobHash: "j" }));
  assert.ok(!isQuickFitCurrent(stored, { matcherVersion: "v2", profileHash: "p", jobHash: "j" }));
  assert.ok(!isQuickFitCurrent(stored, { matcherVersion: "v1", profileHash: "other", jobHash: "j" }));
  assert.ok(!isQuickFitCurrent(stored, { matcherVersion: "v1", profileHash: "p", jobHash: "changed" }));
  assert.ok(!isQuickFitCurrent(stored, { matcherVersion: "v1", profileHash: "p", jobHash: null }));
  assert.ok(!isQuickFitCurrent({ ...stored, discoveryEligible: undefined }, { matcherVersion: "v1", profileHash: "p", jobHash: "j" }));
  assert.ok(!isQuickFitCurrent(null, { matcherVersion: "v1", profileHash: "p", jobHash: "j" }));
});

test("match predicate requires a score strictly above 50 and no conflict band or eligibility", () => {
  assert.ok(qualifiesAsMatch({ fit_score: 51, fit_band: "potential", eligibility_status: "unknown" }));
  assert.ok(!qualifiesAsMatch({ fit_score: 50, fit_band: "potential", eligibility_status: "unknown" }));
  assert.ok(!qualifiesAsMatch({ fit_score: null, fit_band: "needs_information", eligibility_status: "unknown" }));
  assert.ok(!qualifiesAsMatch({ fit_score: 90, fit_band: "likely_conflict", eligibility_status: "aligned" }));
  assert.ok(!qualifiesAsMatch({ fit_score: 90, fit_band: "strong", eligibility_status: "conflict" }));
});

test("matching context is independent of answer row order so profile hashes agree across workers", () => {
  const base = { category: "location" as const, question: "", answer: "", reuse_approved: true, source_job_id: null, provided_at: new Date().toISOString() };
  const answers = [
    { ...base, question_key: "preference_country", normalized_value: "US" },
    { ...base, question_key: "work_authorization_us", normalized_value: "authorized_without_sponsorship", category: "work_authorization" as const },
    { ...base, question_key: "preference_remote", normalized_value: "yes" },
  ];
  const forward = answersToMatchingContext(answers);
  const reversed = answersToMatchingContext([...answers].reverse());
  assert.equal(forward, reversed);
  assert.match(forward, /key=preference_country[\s\S]*key=preference_remote[\s\S]*key=work_authorization_us/);
  assert.equal(forward.split("\n").length, 4, "every fresh answer is included exactly once");
});
