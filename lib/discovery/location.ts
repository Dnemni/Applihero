export type DiscoveryLocationPreferences = {
  preferredCountry: string;
  preferredRegions: string[];
  locationScope: "regions" | "country" | "worldwide";
  includeRemote: boolean;
};

/** Bump when classification rules change so the backfill can find rows to reclassify. */
export const LOCATION_CLASSIFIER_VERSION = "location-v1";

export type DiscoveryLocationClassification = {
  /** ISO-like codes for every country named in the string, in order of appearance. Empty when unrecognized. */
  countries: string[];
  /** True when the role is remote by workplace type or an explicit "remote" in the location. */
  remote: boolean;
  /** Individual places when a posting lists several, split on ";", "|", " / " or " or ". */
  segments: string[];
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

// Aliases are matched as whole words (case-insensitive). Two-letter codes are
// deliberately omitted for countries whose code collides with a US state
// abbreviation (CA, DE, IN...), so "San Jose, CA" stays in the United States.
const countryAliases: Record<string, string[]> = {
  US: ["united states", "united states of america", "usa", "u.s.", "u.s.a.", "us", "estados unidos"],
  CA: ["canada"],
  GB: ["united kingdom", "great britain", "uk", "u.k.", "england", "scotland", "wales", "northern ireland"],
  IE: ["ireland", "republic of ireland"],
  DE: ["germany", "deutschland"],
  FR: ["france"],
  NL: ["netherlands", "the netherlands", "holland"],
  ES: ["spain", "españa"],
  IT: ["italy", "italia"],
  PT: ["portugal"],
  PL: ["poland", "polska"],
  CZ: ["czech republic", "czechia"],
  AT: ["austria"],
  CH: ["switzerland"],
  BE: ["belgium"],
  SE: ["sweden"],
  NO: ["norway"],
  DK: ["denmark"],
  FI: ["finland"],
  HU: ["hungary"],
  RO: ["romania"],
  UA: ["ukraine"],
  TR: ["turkey", "türkiye"],
  IL: ["israel"],
  AE: ["united arab emirates", "uae", "dubai", "abu dhabi"],
  SA: ["saudi arabia"],
  IN: ["india", "bharat"],
  SG: ["singapore"],
  MY: ["malaysia"],
  PH: ["philippines"],
  ID: ["indonesia"],
  TH: ["thailand"],
  VN: ["vietnam", "viet nam"],
  JP: ["japan", "nippon"],
  KR: ["south korea", "korea, republic of", "republic of korea", "korea"],
  CN: ["china", "people's republic of china", "prc", "hong kong", "taiwan"],
  AU: ["australia"],
  NZ: ["new zealand"],
  BR: ["brazil", "brasil"],
  MX: ["mexico", "méxico"],
  AR: ["argentina"],
  CL: ["chile"],
  CO: ["colombia"],
  PE: ["peru"],
  ZA: ["south africa"],
  NG: ["nigeria"],
  KE: ["kenya"],
  EG: ["egypt"],
};

const usStates = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming", "district of columbia", "puerto rico",
];
// "Georgia" is both a US state and a country; the state wins only when the
// string carries another US signal, handled below.
const ambiguousUsStates = new Set(["georgia"]);
// Requires the "City, ST" shape with the code in upper case so prose words such
// as "in" or "or" in a lower-cased string never read as Indiana or Oregon.
const usStateCodes = /,\s*(AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)(?=$|[\s,)\-])/;
// Well-known non-US cities. A bare "City, XX" where XX collides with a US state
// code ("Berlin, DE") is a foreign posting, not Delaware, when the city is one
// of these; they also let "London" or "Bangalore" alone resolve to a country.
const foreignCities: Record<string, string[]> = {
  DE: ["berlin", "munich", "münchen", "hamburg", "frankfurt", "stuttgart", "cologne", "köln", "düsseldorf"],
  GB: ["london", "manchester", "edinburgh", "cambridge, uk", "bristol", "belfast", "glasgow"],
  IE: ["dublin", "cork"],
  FR: ["paris", "lyon", "toulouse", "sophia antipolis"],
  NL: ["amsterdam", "eindhoven", "rotterdam", "utrecht"],
  ES: ["madrid", "barcelona"],
  IT: ["milan", "milano", "rome", "roma"],
  PL: ["warsaw", "kraków", "krakow", "wrocław", "wroclaw", "gdańsk", "gdansk"],
  CH: ["zurich", "zürich", "geneva", "basel"],
  SE: ["stockholm", "gothenburg"],
  DK: ["copenhagen"],
  CZ: ["prague", "brno"],
  AT: ["vienna", "wien"],
  IL: ["tel aviv", "herzliya", "haifa"],
  IN: ["bangalore", "bengaluru", "hyderabad", "pune", "chennai", "mumbai", "gurgaon", "gurugram", "noida", "delhi", "kolkata"],
  SG: ["singapore"],
  JP: ["tokyo", "osaka"],
  KR: ["seoul"],
  CN: ["shanghai", "beijing", "shenzhen", "hangzhou", "hong kong", "taipei"],
  AU: ["sydney", "melbourne", "brisbane", "perth", "canberra"],
  NZ: ["auckland", "wellington"],
  CA: ["toronto", "vancouver", "montreal", "montréal", "ottawa", "waterloo", "calgary"],
  BR: ["são paulo", "sao paulo", "rio de janeiro"],
  MX: ["mexico city", "ciudad de méxico", "guadalajara", "monterrey"],
  AR: ["buenos aires"],
  ZA: ["johannesburg", "cape town"],
  AE: ["dubai", "abu dhabi"],
  PH: ["manila", "cebu"],
  MY: ["kuala lumpur", "cyberjaya"],
};

const usCities = ["new york city", "nyc", "san francisco", "silicon valley", "bay area", "los angeles", "seattle", "austin", "boston", "chicago", "denver", "atlanta", "dallas", "houston", "phoenix", "miami", "san diego", "san jose", "sunnyvale", "mountain view", "palo alto", "menlo park", "cupertino", "redmond", "bellevue", "washington dc", "washington, d.c.", "pittsburgh", "philadelphia", "portland", "minneapolis", "raleigh", "durham", "charlotte", "nashville", "salt lake city", "las vegas", "detroit", "st. louis", "kansas city", "cambridge, ma", "santa clara", "irvine", "san mateo", "oakland", "berkeley"];

function normalized(value: string | null | undefined) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(haystack: string, term: string) {
  const escaped = escapeRegExp(normalized(term));
  return Boolean(escaped && new RegExp(`(^|[^a-z])${escaped}($|[^a-z])`, "i").test(haystack));
}

export function splitLocationSegments(location: string | null | undefined) {
  return String(location || "").split(/\s*(?:;|\||\/|\bor\b|\band\b|·|•)\s*/i).map(part => part.trim()).filter(Boolean);
}

function foreignCityCountries(segment: string) {
  return Object.entries(foreignCities).filter(([, cities]) => cities.some(city => containsTerm(segment, city))).map(([code]) => code);
}

/** `original` keeps provider casing so "Austin, TX" is a state code while "in" or "or" in prose is not. */
function hasUnitedStatesSignal(original: string) {
  const segment = normalized(original);
  const explicit = countryAliases.US.some(alias => containsTerm(segment, alias)) ||
    usStates.some(state => !ambiguousUsStates.has(state) && containsTerm(segment, state)) ||
    usCities.some(city => containsTerm(segment, city));
  if (explicit) return true;
  // "Berlin, DE" is Germany, not Delaware: a state code only counts when the
  // segment does not name a well-known foreign city.
  return usStateCodes.test(original) && !foreignCityCountries(segment).length;
}

function countriesInSegment(original: string) {
  const segment = normalized(original);
  const found: string[] = [];
  for (const [code, aliases] of Object.entries(countryAliases)) {
    if (code === "US") continue;
    if (aliases.some(alias => containsTerm(segment, alias))) found.push(code);
  }
  for (const code of foreignCityCountries(segment)) if (!found.includes(code)) found.push(code);
  // "Georgia" alone is the country; "Atlanta, Georgia" or "Georgia, US" is the state.
  const mentionsGeorgia = containsTerm(segment, "georgia");
  const georgiaIsState = mentionsGeorgia && (hasUnitedStatesSignal(original) || /\batlanta\b|\bsavannah\b/.test(segment));
  if (mentionsGeorgia && !georgiaIsState) found.push("GE");
  if (hasUnitedStatesSignal(original)) found.unshift("US");
  return Array.from(new Set(found));
}

/**
 * Classifies a raw provider location string once so the database can filter by
 * country and remote flag. Every listed place contributes; an unrecognized
 * string yields no countries and is treated as unknown, never as a match.
 */
export function classifyDiscoveryLocation(location: string | null | undefined, workplaceType?: string | null): DiscoveryLocationClassification {
  const original = String(location || "").replace(/\s+/g, " ").trim();
  const segments = splitLocationSegments(original);
  const remote = normalized(workplaceType) === "remote" || /\bremote\b|\bwork from home\b|\bwfh\b|\bdistributed\b|\banywhere\b/i.test(original);
  const countries = Array.from(new Set(segments.flatMap(countriesInSegment)));
  return { countries, remote, segments: segments.map(segment => normalized(segment)) };
}

function preferredCountryCode(country: string) {
  const target = normalized(country).toUpperCase();
  return target === "USA" ? "US" : target;
}

/**
 * Strict saved-geography rule shared by the in-memory Matches filter and the
 * database catalog filter:
 * - remote roles follow the include-remote flag; a remote role that names a
 *   country must name the preferred one under country or region scope;
 * - worldwide scope (or no saved country) accepts everything else;
 * - country scope needs the preferred country among the listed places;
 * - region scope additionally needs a preferred region term in the string;
 * - blank or unrecognized locations fail country and region scope.
 */
export function matchesDiscoveryLocation(job: { location?: string | null; workplace_type?: string | null }, preferences: DiscoveryLocationPreferences) {
  const classification = classifyDiscoveryLocation(job.location, job.workplace_type);
  return matchesClassifiedLocation(classification, normalized(job.location), preferences);
}

export function matchesClassifiedLocation(classification: { countries: string[]; remote: boolean }, locationText: string, preferences: DiscoveryLocationPreferences) {
  const broad = preferences.locationScope === "worldwide" || !preferences.preferredCountry;
  const country = preferredCountryCode(preferences.preferredCountry);
  if (classification.remote) {
    if (!preferences.includeRemote) return false;
    // "Remote" alone is location-agnostic; "Remote - Australia" is remote within
    // Australia and should not reach a US-scoped feed.
    return broad || !classification.countries.length || classification.countries.includes(country);
  }
  if (broad) return true;
  if (!classification.countries.includes(country)) return false;
  if (preferences.locationScope !== "regions") return true;
  return preferences.preferredRegions.some(region => containsTerm(normalized(locationText), region));
}

/** Postgres regular expression (case-insensitive `~*`) equivalent to `containsTerm` for one region. */
export function regionPattern(region: string) {
  return `(^|[^a-z])${escapeRegExp(normalized(region))}($|[^a-z])`;
}

/** Column values the ingestion, enrichment, and backfill writers store for one posting. */
export function discoveryLocationColumns(location: string | null | undefined, workplaceType: string | null | undefined) {
  const classification = classifyDiscoveryLocation(location, workplaceType);
  return {
    location_countries: classification.countries,
    location_remote: classification.remote,
    location_classifier_version: LOCATION_CLASSIFIER_VERSION,
  };
}
