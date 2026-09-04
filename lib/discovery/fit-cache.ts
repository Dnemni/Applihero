import type { QuickFit } from "./types";

/**
 * Stored fit rows are compared and validated in several places (the sync
 * worker, the rematch worker, and the feed route). Postgres reorders JSONB keys,
 * so naive JSON.stringify comparisons always differ. Everything here is
 * order-insensitive and free of database access.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

export function quickFitEquals(left: unknown, right: unknown) {
  return canonicalJson(left ?? null) === canonicalJson(right ?? null);
}

export type FitCurrency = { matcherVersion: string; profileHash: string; jobHash: string | null | undefined };

/** A stored fit is current only when every input it was evaluated against still matches. */
export function isQuickFitCurrent(stored: Partial<QuickFit> | null | undefined, inputs: FitCurrency) {
  return Boolean(stored) &&
    stored!.matcherVersion === inputs.matcherVersion &&
    stored!.evaluatedProfileHash === inputs.profileHash &&
    Boolean(inputs.jobHash) && stored!.evaluatedJobHash === inputs.jobHash &&
    typeof stored!.discoveryEligible === "boolean";
}

/** Shared feed predicate: qualifying matches need a real score above 50 and no conflict signal. */
export const MATCH_MINIMUM_SCORE = 50;

export function qualifiesAsMatch(row: { fit_score: number | null; fit_band: string; eligibility_status: string }) {
  return row.fit_score !== null && row.fit_score > MATCH_MINIMUM_SCORE && row.fit_band !== "likely_conflict" && row.eligibility_status !== "conflict";
}

export function isStrongMatch(row: { fit_score: number | null; fit_band: string; eligibility_status: string }) {
  return qualifiesAsMatch(row) && (row.fit_score as number) >= 75;
}
