import type { NormalizedSourceJob } from "./connectors";

export type DiscoveryApplicantProfile = {
  graduationYear: number | null;
  countryCode: string | null;
  preferredRegions: string[];
  locationScope: "regions" | "country" | "worldwide";
  includeRemote: boolean;
  isStudent: boolean;
  degreeLevel: "bachelor" | "master" | "doctorate" | null;
};

export type DiscoveryEligibility = {
  eligible: boolean;
  reason: string;
};

const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY", "DC",
]);
const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

function graduationYear(background: string): number | null {
  const lines = background.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const range = lines.find(line =>
    /university|college|bachelor|master/i.test(line) &&
    /\b(?:19|20)\d{2}\b\s*[–—-]\s*(?:[A-Za-z.]+\s+)?\b20\d{2}\b/.test(line)
  )?.match(/\b(?:19|20)\d{2}\b\s*[–—-]\s*(?:[A-Za-z.]+\s+)?\b(20\d{2})\b/);
  if (range) return Number(range[1]);
  const explicit = background.match(/(?:expected|anticipated|class of|graduat(?:e|ing|ion))[^\n]{0,45}?\b(20\d{2})\b/i);
  return explicit ? Number(explicit[1]) : null;
}

export function getDiscoveryApplicantProfile(background: string): DiscoveryApplicantProfile {
  const year = graduationYear(background);
  const stateMatches = Array.from(background.matchAll(/(?:,\s*|\b)([A-Z]{2})(?:\s+\d{5}\b|(?=\s*(?:$|[;|•])))/gm))
    .map(match => match[1])
    .filter(state => US_STATES.has(state));
  const preferredRegions = Array.from(new Set(stateMatches));
  const hasUsLocation = preferredRegions.length > 0 || /\bUnited States\b|\bU\.S\.\b/.test(background);
  const confirmedCountry = background.match(/APPLIHERO_CONFIRMED key=preference_country value=([^\s]+)/)?.[1] || null;
  const confirmedRegions = background.match(/APPLIHERO_CONFIRMED key=preference_regions value=([^\s]+)/)?.[1]
    ?.split(",").map(region => decodeURIComponent(region)).filter(Boolean) || [];
  const confirmedRemote = background.match(/APPLIHERO_CONFIRMED key=preference_remote value=([^\s]+)/)?.[1];
  const confirmedLocationScope = background.match(/APPLIHERO_CONFIRMED key=preference_location_scope value=([^\s]+)/)?.[1];
  const locationScope = confirmedLocationScope === "regions" || confirmedLocationScope === "worldwide"
    ? confirmedLocationScope
    : "country";
  const degreeLevel = /\b(?:ph\.?d\.?|doctorate|doctoral)\b/i.test(background)
    ? "doctorate" as const
    : /\b(?:m\.?s\.?|master(?:'s)?)\b/i.test(background)
      ? "master" as const
      : /\b(?:b\.?s\.?|b\.?a\.?|bachelor(?:'s)?)\b/i.test(background)
        ? "bachelor" as const
        : null;
  return {
    graduationYear: year,
    countryCode: confirmedCountry || (hasUsLocation ? "US" : null),
    preferredRegions: confirmedRegions.length ? confirmedRegions : preferredRegions,
    // Country-wide is intentionally the default. A résumé address is useful context,
    // but it should never silently limit a user to only a few nearby roles.
    locationScope,
    includeRemote: confirmedRemote !== "no",
    isStudent: year !== null && year > new Date().getFullYear(),
    degreeLevel,
  };
}

function jobCountry(job: NormalizedSourceJob): string | null {
  const raw = job.raw_payload as Record<string, any> | null;
  const providerCountry = String(raw?.PrimaryLocationCountry || raw?.primaryLocationCountry || raw?.country_code || "").trim();
  if (providerCountry) return /^(?:US|USA|United States(?: of America)?)$/i.test(providerCountry) ? "US" : providerCountry;
  const attributes = Array.isArray(raw?.docattributes)
    ? Object.assign({}, ...raw.docattributes.filter((item: unknown) => item && typeof item === "object"))
    : {};
  const explicit = String(attributes.field_keyword_05 || "").trim();
  if (explicit) return /^(?:US|USA|United States(?: of America)?)$/i.test(explicit) ? "US" : explicit;
  const location = job.location || "";
  if (/\bUnited States\b|\bUSA\b|,\s*US\b/i.test(location)) return "US";
  const state = location.match(/(?:,|\s)\s*([A-Z]{2})(?:\b|\s+\d{5}\b)/)?.[1];
  return state && US_STATES.has(state) ? "US" : null;
}

function sameCountry(left: string, right: string) {
  const aliases: Record<string, string> = {
    USA: "US", "UNITED STATES": "US", "UNITED STATES OF AMERICA": "US",
    CAN: "CA", CANADA: "CA", GBR: "GB", "UNITED KINGDOM": "GB", UK: "GB",
    AUS: "AU", AUSTRALIA: "AU", IND: "IN", INDIA: "IN", IRL: "IE", IRELAND: "IE",
    BRA: "BR", BRAZIL: "BR", CHN: "CN", CHINA: "CN", JPN: "JP", JAPAN: "JP",
    DEU: "DE", GERMANY: "DE", FRA: "FR", FRANCE: "FR", SGP: "SG", SINGAPORE: "SG",
  };
  const normalize = (value: string) => aliases[value.trim().toUpperCase()] || value.trim().toUpperCase();
  return normalize(left) === normalize(right);
}

export function assessDiscoveryEligibility(
  job: NormalizedSourceJob,
  profile: DiscoveryApplicantProfile,
): DiscoveryEligibility {
  // Provider descriptions often contain unrelated mentions of interns or
  // student programs. For a student-only feed, require the role title itself
  // to identify an internship/co-op instead of trusting inferred job type.
  const internship = /\bintern(?:ship)?\b|\bco[ -]?op\b|\bstudent\b/i.test(job.title);
  if (/\bintern conversion\b|\bconversion\s*[-:]\s*.*\bintern\b/i.test(job.title)) {
    return { eligible: false, reason: "Intern-conversion roles require a prior internship with that employer." };
  }
  if (profile.isStudent && !internship) {
    return { eligible: false, reason: `Student profile graduating in ${profile.graduationYear}; role is not an internship or co-op.` };
  }
  if (profile.degreeLevel === "bachelor" && /\b(?:graduate|master(?:'s)?|mba)\b/i.test(job.title) && internship) {
    return { eligible: false, reason: "Graduate-level internship does not align with the applicant's bachelor’s program." };
  }
  if (/\bnew grad(?:uate)?\b|\bgraduate\b/i.test(job.title) && !internship) {
    return { eligible: false, reason: "Graduate role does not align with an active student profile." };
  }
  const country = jobCountry(job);
  const locationText = `${job.location || ""} ${job.workplace_type || ""}`;
  const remote = /\bremote\b/i.test(locationText);
  const worldwideRemote = remote && /\bworldwide\b|\bglobal\b|\banywhere\b/i.test(locationText);
  if (remote && !profile.includeRemote) {
    return { eligible: false, reason: "Remote roles are excluded by the applicant's location preferences." };
  }
  if (profile.locationScope !== "worldwide" && profile.countryCode && country && !sameCountry(country, profile.countryCode) && !worldwideRemote) {
    return { eligible: false, reason: `Role location (${country}) does not match the applicant country (${profile.countryCode}).` };
  }
  if (profile.locationScope === "regions" && profile.preferredRegions.length && sameCountry(profile.countryCode || "", country || profile.countryCode || "") && !remote) {
    const matchesRegion = profile.preferredRegions.some(region => {
      const normalized = region.trim();
      const expanded = US_STATE_NAMES[normalized.toUpperCase()];
      const direct = normalized.length === 2
        ? new RegExp(`\\b${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(locationText)
        : locationText.toLowerCase().includes(normalized.toLowerCase());
      return direct || Boolean(expanded && locationText.toLowerCase().includes(expanded.toLowerCase()));
    });
    if (!matchesRegion) return { eligible: false, reason: "Role location does not match the applicant's preferred regions." };
  }
  return { eligible: true, reason: country ? "Role type and country align." : "Role type aligns; location requires confirmation." };
}
