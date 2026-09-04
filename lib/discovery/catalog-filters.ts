import { regionPattern, type DiscoveryLocationPreferences } from "./location";

/**
 * A PostgREST filter step: `[method, ...args]` applied to a query builder in
 * order. Kept as data so the exact SQL-side predicates can be unit tested
 * without a database and reused by the diagnostic scripts.
 */
export type CatalogFilterStep =
  | ["eq", string, string | boolean]
  | ["ilike", string, string]
  | ["gte", string, string]
  | ["contains", string, string[]]
  | ["or", string];

export type CatalogFilterOptions = {
  query?: string;
  company?: string;
  location?: string;
  workplace?: string;
  freshness?: number;
  now?: number;
};

export function safeCatalogTerm(value: string) {
  return value.replace(/[(),.%"\\]/g, " ").replace(/\s+/g, " ").trim();
}

function preferredCountryCode(country: string) {
  const code = country.trim().toUpperCase();
  return code === "USA" ? "US" : code;
}

/** Quoted so PostgREST's `or()` parser accepts commas and parentheses inside the pattern. */
function quotedRegion(region: string) {
  return `location.imatch."${regionPattern(region).replace(/"/g, "")}"`;
}

/** Predicates for the user-controlled filters (search box, company, location text, workplace, posted-within). */
export function buildCatalogFilterSteps(options: CatalogFilterOptions): CatalogFilterStep[] {
  const steps: CatalogFilterStep[] = [["eq", "status", "open"]];
  const search = safeCatalogTerm(options.query || "");
  // Title and company only: descriptions are not indexed for pattern search and
  // scanning them exceeded the statement timeout at 30k rows.
  if (search) steps.push(["or", `title.ilike.%${search}%,company_name.ilike.%${search}%`]);
  if (options.company) steps.push(["ilike", "company_name", `%${safeCatalogTerm(options.company)}%`]);
  if (options.location) steps.push(["ilike", "location", `%${safeCatalogTerm(options.location)}%`]);
  const workplace = (options.workplace || "").toLowerCase().replace(/\s+/g, "");
  if (workplace === "remote" || workplace === "hybrid") steps.push(["ilike", "workplace_type", workplace]);
  else if (workplace === "on-site" || workplace === "onsite") steps.push(["or", "workplace_type.ilike.on-site,workplace_type.ilike.onsite"]);
  if (options.freshness && options.freshness > 0) steps.push(["gte", "source_published_at", new Date((options.now ?? Date.now()) - options.freshness * 86_400_000).toISOString()]);
  return steps;
}

/**
 * Database form of `matchesDiscoveryLocation`, using the normalized
 * `location_countries` / `location_remote` columns written at ingestion:
 * - remote rows are included or excluded by the include-remote flag, and a
 *   remote row that names countries must name the preferred one;
 * - worldwide scope (or no saved country) keeps every non-remote row;
 * - country scope needs the preferred country in `location_countries`;
 * - region scope additionally needs a whole-word region match in `location`;
 * - rows with no recognized country fail country and region scope.
 */
export function buildCatalogLocationSteps(preferences: DiscoveryLocationPreferences): CatalogFilterStep[] {
  const country = preferredCountryCode(preferences.preferredCountry);
  const broad = preferences.locationScope === "worldwide" || !country;
  if (broad) return preferences.includeRemote ? [] : [["eq", "location_remote", false]];
  const countryClause = `location_countries.cs.{${country}}`;
  const regions = preferences.locationScope === "regions" ? preferences.preferredRegions.map(safeCatalogTerm).filter(Boolean) : [];
  if (preferences.locationScope === "regions" && !regions.length) {
    // Region scope without any saved region cannot match anything; fall back to the country rule so the feed is not silently empty.
  }
  const located = regions.length ? `and(${countryClause},or(${regions.map(quotedRegion).join(",")}))` : countryClause;
  // A remote role with no recognized country is location-agnostic; one that
  // names countries is remote within them and must include the preferred one.
  const remote = `and(location_remote.eq.true,or(location_countries.eq.{},${countryClause}))`;
  if (preferences.includeRemote) return [["or", `${remote},and(location_remote.eq.false,${located})`]];
  return [["eq", "location_remote", false], ["or", located]];
}

/** Applies steps to a supabase-js query builder. */
export function applyCatalogFilterSteps<T extends Record<string, any>>(query: T, steps: CatalogFilterStep[]): T {
  let current: any = query;
  for (const step of steps) {
    if (step[0] === "or") current = current.or(step[1]);
    else if (step[0] === "contains") current = current.contains(step[1], step[2]);
    else current = current[step[0]](step[1], step[2]);
  }
  return current;
}
