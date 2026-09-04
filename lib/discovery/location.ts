export type DiscoveryLocationPreferences = {
  preferredCountry: string;
  preferredRegions: string[];
  locationScope: "regions" | "country" | "worldwide";
  includeRemote: boolean;
};

/** Decodes the saved `user_discovery_answers` preference rows into the strict filter's inputs. */
export function decodeLocationPreferences(rows: Array<{ question_key: string; normalized_value: string | null }>): DiscoveryLocationPreferences {
  const values = new Map(rows.map(row => [row.question_key, row.normalized_value]));
  const scope = String(values.get("preference_location_scope") || "country");
  return {
    preferredCountry: String(values.get("preference_country") || ""),
    preferredRegions: String(values.get("preference_regions") || "").split(",").filter(Boolean).map(value => { try { return decodeURIComponent(value); } catch { return value; } }),
    locationScope: scope === "regions" || scope === "worldwide" ? scope : "country",
    includeRemote: values.get("preference_remote") !== "no",
  };
}

const countryAliases: Record<string, string[]> = {
  US: ["united states", "united states of america", "usa", "u.s.", "u.s.a.", "us"],
  USA: ["united states", "united states of america", "usa", "u.s.", "u.s.a.", "us"],
  DE: ["germany", "deutschland", "de"],
  GB: ["united kingdom", "great britain", "uk", "u.k.", "england", "scotland", "wales"],
};

const usStates = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming", "district of columbia",
];

function normalized(value: string | null | undefined) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function containsTerm(haystack: string, term: string) {
  const escaped = normalized(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Boolean(escaped && new RegExp(`(^|[^a-z])${escaped}($|[^a-z])`, "i").test(haystack));
}

function isUnitedStatesLocation(location: string) {
  return countryAliases.US.some(alias => containsTerm(location, alias)) ||
    usStates.some(state => containsTerm(location, state)) ||
    /,\s*(AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b/i.test(location);
}

function isInCountry(location: string, country: string) {
  const target = normalized(country).toUpperCase();
  if (!target) return true;
  if (["US", "USA"].includes(target)) return isUnitedStatesLocation(location);
  const aliases = countryAliases[target] || [target.toLowerCase()];
  return aliases.some(alias => containsTerm(location, alias));
}

/** Apply saved geography before matching so a Berlin role cannot become a US match. */
export function matchesDiscoveryLocation(job: { location?: string | null; workplace_type?: string | null }, preferences: DiscoveryLocationPreferences) {
  const location = normalized(job.location);
  const remote = normalized(job.workplace_type) === "remote" || /\bremote\b/i.test(location);
  if (remote) return preferences.includeRemote;
  if (preferences.locationScope === "worldwide" || !preferences.preferredCountry) return true;
  if (!location || !isInCountry(location, preferences.preferredCountry)) return false;
  if (preferences.locationScope !== "regions") return true;
  return preferences.preferredRegions.some(region => containsTerm(location, region));
}
