import { isIP } from "node:net";
import { fetchGreenhouseBoard } from "./greenhouse";
import { hashText, htmlToPlainText, parseJobRequirements, REQUIREMENTS_PARSER_VERSION } from "./parser";
import { searchOfficialCompanyCareers, searchOfficialCompanyJobs } from "./parallel-search";
import type { JobProvider } from "./types";

export type NormalizedSourceJob = Awaited<ReturnType<typeof fetchGreenhouseBoard>>[number] & {
  source_published_precision?: "instant" | "day" | "relative_day" | "unknown";
  source_published_source?: string | null;
  listing_hash?: string;
};

export type SourceScanMode = "bootstrap" | "incremental" | "reconcile";

export type SourceScanContext = {
  mode?: SourceScanMode;
  knownJobIds?: Set<string>;
  scanState?: JsonRecord;
  lastFullScanAt?: string | null;
  maxJobs?: number;
};

export type SourceScanMeta = {
  strategy: string;
  mode: SourceScanMode;
  fullScan: boolean;
  authoritative: boolean;
  boardTotal: number | null;
  enumeratedCount: number;
  pagesFetched: number;
  state: JsonRecord;
  warnings: string[];
};

export type SourceScanBatch = { jobs: NormalizedSourceJob[]; meta: SourceScanMeta };

export type SourceConfig = {
  provider: JobProvider;
  externalKey: string;
  companyName: string;
  careerUrl: string;
  config: Record<string, unknown>;
};

type JsonRecord = Record<string, any>;

const KNOWN_COMPANIES: Array<SourceConfig & { aliases: string[] }> = [
  {
    provider: "eightfold",
    externalKey: "microsoft.com",
    companyName: "Microsoft",
    careerUrl: "https://apply.careers.microsoft.com/careers",
    config: {
      apiUrl: "https://apply.careers.microsoft.com/api/pcsx/search",
      domain: "microsoft.com",
      origin: "https://apply.careers.microsoft.com",
      maxJobs: 100,
    },
    aliases: ["microsoft", "microsoft corporation"],
  },
  {
    provider: "workday",
    externalKey: "nvidia/NVIDIAExternalCareerSite",
    companyName: "NVIDIA",
    careerUrl: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
    config: { host: "nvidia.wd5.myworkdayjobs.com", tenant: "nvidia", site: "NVIDIAExternalCareerSite" },
    aliases: ["nvidia", "nvidia corporation"],
  },
  {
    provider: "amazon",
    externalKey: "amazon-jobs",
    companyName: "Amazon",
    careerUrl: "https://www.amazon.jobs/en/search",
    config: { searchQueries: ["intern", "co-op", "student"] },
    aliases: ["amazon", "amazon.com", "amazon web services", "aws"],
  },
  {
    provider: "ibm",
    externalKey: "careers2",
    companyName: "IBM",
    careerUrl: "https://www.ibm.com/careers/search",
    config: { appId: "careers", scope: "careers2" },
    aliases: ["ibm", "international business machines"],
  },
  {
    provider: "ashby",
    externalKey: "openai",
    companyName: "OpenAI",
    careerUrl: "https://jobs.ashbyhq.com/openai",
    config: { board: "openai" },
    aliases: ["openai"],
  },
  {
    provider: "workable",
    externalKey: "netguru",
    companyName: "Netguru",
    careerUrl: "https://apply.workable.com/netguru",
    config: { account: "netguru" },
    aliases: ["netguru"],
  },
  {
    provider: "oracle",
    externalKey: "egug.fa.us2.oraclecloud.com/CX_1",
    companyName: "American Express",
    careerUrl: "https://careers.americanexpress.com/en/sites/CX_1/jobs",
    config: {
      apiHost: "egug.fa.us2.oraclecloud.com",
      siteNumber: "CX_1",
      displayBaseUrl: "https://careers.americanexpress.com/en/sites/CX_1",
    },
    aliases: ["american express", "amex", "american express company"],
  },
  { provider: "career_site", externalKey: "jobs.apple.com/en-us/search", companyName: "Apple", careerUrl: "https://jobs.apple.com/en-us/search", config: { careerUrl: "https://jobs.apple.com/en-us/search", maxJobs: 100 }, aliases: ["apple", "apple inc"] },
  { provider: "career_site", externalKey: "google.com/about/careers/applications/jobs/results", companyName: "Google", careerUrl: "https://www.google.com/about/careers/applications/jobs/results", config: { careerUrl: "https://www.google.com/about/careers/applications/jobs/results", maxJobs: 100 }, aliases: ["google", "google llc", "alphabet"] },
  { provider: "indexed_site", externalKey: "metacareers.com/jobs", companyName: "Meta", careerUrl: "https://www.metacareers.com/jobs", config: { companyName: "Meta", baseUrl: "https://www.metacareers.com/jobs", maxJobs: 20 }, aliases: ["meta", "meta platforms", "facebook"] },
  { provider: "indexed_site", externalKey: "higher.gs.com/results", companyName: "Goldman Sachs", careerUrl: "https://higher.gs.com/results", config: { companyName: "Goldman Sachs", baseUrl: "https://higher.gs.com/results", maxJobs: 20 }, aliases: ["goldman sachs", "goldman sachs group"] },
  { provider: "indexed_site", externalKey: "careers.walmart.com/results", companyName: "Walmart", careerUrl: "https://careers.walmart.com/results", config: { companyName: "Walmart", baseUrl: "https://careers.walmart.com/results", maxJobs: 20 }, aliases: ["walmart", "walmart inc"] },
  { provider: "eightfold", externalKey: "lockheedmartin.eightfold.ai/lockheedmartin.com", companyName: "Lockheed Martin", careerUrl: "https://lockheedmartin.eightfold.ai/careers", config: { apiUrl: "https://lockheedmartin.eightfold.ai/api/pcsx/search", domain: "lockheedmartin.com", origin: "https://lockheedmartin.eightfold.ai", maxJobs: 100 }, aliases: ["lockheed martin", "lockheed martin corporation"] },
  { provider: "indexed_site", externalKey: "atlassian.com/company/careers/all-jobs", companyName: "Atlassian", careerUrl: "https://www.atlassian.com/company/careers/all-jobs", config: { companyName: "Atlassian", baseUrl: "https://www.atlassian.com/company/careers/all-jobs", maxJobs: 20 }, aliases: ["atlassian", "atlassian corporation"] },
  { provider: "indexed_site", externalKey: "lifeattiktok.com/search", companyName: "TikTok", careerUrl: "https://lifeattiktok.com/search", config: { companyName: "TikTok", baseUrl: "https://lifeattiktok.com/search", maxJobs: 20 }, aliases: ["tiktok", "tik tok"] },
  { provider: "indexed_site", externalKey: "careers.zoom.us/jobs", companyName: "Zoom", careerUrl: "https://careers.zoom.us/jobs/search", config: { companyName: "Zoom", baseUrl: "https://careers.zoom.us/jobs/search", maxJobs: 20 }, aliases: ["zoom", "zoom video communications"] },
  { provider: "avature", externalKey: "jobs.ea.com/careers", companyName: "Electronic Arts", careerUrl: "https://jobs.ea.com/en_US/careers", config: { baseUrl: "https://jobs.ea.com", locale: "en_US", portal: "careers", maxJobs: 100 }, aliases: ["electronic arts", "ea", "electronic arts inc"] },
  { provider: "career_site", externalKey: "shopify.com/careers", companyName: "Shopify", careerUrl: "https://www.shopify.com/careers", config: { careerUrl: "https://www.shopify.com/careers", maxJobs: 100 }, aliases: ["shopify", "shopify inc"] },
  { provider: "indexed_site", externalKey: "ats.rippling.com/rippling/jobs", companyName: "Rippling", careerUrl: "https://ats.rippling.com/rippling/jobs", config: { companyName: "Rippling", baseUrl: "https://ats.rippling.com/rippling/jobs", maxJobs: 20 }, aliases: ["rippling", "rippling people center"] },
];

function employmentType(text: string): string | null {
  const value = text.toLowerCase();
  if (/\bintern(?:ship)?\b/.test(value)) return "internship";
  if (/\bcontract(?:or)?\b/.test(value)) return "contract";
  if (/\bpart[- ]time\b/.test(value)) return "part-time";
  if (/\bfull[- ]time\b/.test(value)) return "full-time";
  return null;
}

function workplaceType(text: string): string | null {
  const value = text.toLowerCase();
  if (/\bhybrid\b/.test(value)) return "hybrid";
  if (/\bremote\b/.test(value)) return "remote";
  if (/\bon[- ]site\b|\bonsite\b|in[- ]office/.test(value)) return "on-site";
  return null;
}

function normalizedJob(input: {
  id: string;
  title: string;
  html?: string | null;
  description?: string;
  location?: string | null;
  workplace?: string | null;
  employment?: string | null;
  departments?: string[];
  sourceUrl: string;
  applyUrl?: string;
  publishedAt?: string | null;
  publishedPrecision?: "instant" | "day" | "relative_day" | "unknown";
  publishedSource?: string | null;
  updatedAt?: string | null;
  deadline?: string | null;
  raw: JsonRecord;
  parseRequirements?: boolean;
}): NormalizedSourceJob {
  const description = input.description || htmlToPlainText(input.html || "");
  const combined = `${input.title} ${input.location || ""} ${description}`;
  const inferredEmployment = employmentType(combined);
  const listingHash = hashText(JSON.stringify({
    id: input.id,
    title: input.title,
    location: input.location || null,
    workplace: input.workplace || null,
    employment: input.employment || null,
    publishedAt: input.publishedAt || null,
    sourceUrl: input.sourceUrl,
  }));
  return {
    source_job_id: input.id,
    title: input.title,
    description,
    description_html: input.html || null,
    location: input.location || null,
    workplace_type: input.workplace || workplaceType(combined),
    employment_type: inferredEmployment === "internship" ? inferredEmployment : input.employment || inferredEmployment,
    departments: input.departments || [],
    source_url: input.sourceUrl,
    apply_url: input.applyUrl || input.sourceUrl,
    source_published_at: input.publishedAt || null,
    source_published_precision: input.publishedPrecision || (input.publishedAt ? "instant" : "unknown"),
    source_published_source: input.publishedSource || null,
    source_updated_at: input.updatedAt || null,
    application_deadline: input.deadline || null,
    raw_payload: input.raw as any,
    parsed_requirements: input.parseRequirements === false ? [] : parseJobRequirements(description),
    parser_version: REQUIREMENTS_PARSER_VERSION,
    content_hash: hashText(JSON.stringify({
      title: input.title,
      description,
      location: input.location || null,
      updatedAt: input.updatedAt || null,
      parserVersion: REQUIREMENTS_PARSER_VERSION,
    })),
    listing_hash: listingHash,
  };
}

async function fetchJson(url: string, init: RequestInit = {}) {
  let lastStatus: number | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", "User-Agent": "AppliHero Job Monitor/1.0", ...(init.headers || {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) return response.json();
    lastStatus = response.status;
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1_000, 8_000)
        : 350 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    break;
  }
  throw new Error(`Source returned ${lastStatus || "an invalid response"}`);
}

async function fetchLever(site: string): Promise<NormalizedSourceJob[]> {
  const rows = await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`) as JsonRecord[];
  return rows.map(row => {
    // Lever keeps responsibilities and qualifications in `lists`, separate
    // from the introductory description. Omitting them produces confident
    // scores from marketing copy instead of the actual candidate criteria.
    const listHtml = (Array.isArray(row.lists) ? row.lists : []).map((list: JsonRecord) =>
      `${list.text ? `<h2>${list.text}</h2>` : ""}${list.content || ""}`
    ).join("\n");
    const html = [row.description, listHtml, row.additional].filter(Boolean).join("\n");
    return normalizedJob({
      id: String(row.id), title: row.text, html,
      location: row.categories?.location,
      workplace: row.workplaceType, employment: row.categories?.commitment,
      departments: [row.categories?.team, row.categories?.department].filter(Boolean),
      sourceUrl: row.hostedUrl, applyUrl: row.applyUrl,
      publishedAt: row.createdAt ? new Date(row.createdAt).toISOString() : null, raw: row,
      parseRequirements: false,
    });
  });
}

async function fetchAshby(board: string): Promise<NormalizedSourceJob[]> {
  const payload = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`) as { jobs?: JsonRecord[] };
  return (payload.jobs || []).map(row => normalizedJob({
    id: String(row.id || row.jobUrl), title: row.title, html: row.descriptionHtml,
    location: row.location, workplace: row.workplaceType, employment: row.employmentType,
    departments: [row.department, row.team].filter(Boolean), sourceUrl: row.jobUrl,
    applyUrl: row.applyUrl, publishedAt: row.publishedAt, raw: row,
    parseRequirements: false,
  }));
}

async function fetchWorkable(config: JsonRecord = {}): Promise<NormalizedSourceJob[]> {
  const account = String(config.account || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(account)) throw new Error("Invalid Workable account");
  const payload = await fetchJson(`https://www.workable.com/api/accounts/${encodeURIComponent(account)}?details=true`) as JsonRecord;
  return (Array.isArray(payload.jobs) ? payload.jobs : []).map((row: JsonRecord) => {
    const location = row.location?.location_str || [row.city, row.state, row.country].filter(Boolean).join(", ");
    const sourceUrl = String(row.url || row.shortlink || row.application_url || `https://apply.workable.com/j/${row.shortcode}`);
    return normalizedJob({
      id: String(row.shortcode || row.id || sourceUrl),
      title: String(row.title || row.full_title || "Untitled role"),
      html: String(row.description || ""),
      location: String(location || "") || null,
      workplace: row.location?.workplace_type || (row.telecommuting ? "remote" : null),
      employment: String(row.employment_type || "") || null,
      departments: [row.department].filter(Boolean).map(String),
      sourceUrl,
      applyUrl: String(row.application_url || row.url || sourceUrl),
      publishedAt: String(row.published_on || row.created_at || "") || null,
      publishedPrecision: "instant",
      publishedSource: row.published_on ? "workable.published_on" : "workable.created_at",
      updatedAt: String(row.updated_at || "") || null,
      raw: row,
      parseRequirements: false,
    });
  });
}

async function fetchSmartRecruiters(config: JsonRecord = {}): Promise<NormalizedSourceJob[]> {
  const company = String(config.company || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(company)) throw new Error("Invalid SmartRecruiters company identifier");
  const requested = Number(config.maxJobs || 100);
  const maxJobs = Math.max(1, Math.min(Number.isFinite(requested) ? requested : 100, 100));
  const payload = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings?limit=${maxJobs}&offset=0`) as JsonRecord;
  return (Array.isArray(payload.content) ? payload.content : []).map((row: JsonRecord) => {
    const location = String(row.location?.fullLocation || [row.location?.city, row.location?.region, row.location?.country].filter(Boolean).join(", ") || "") || null;
    const sourceUrl = String(row.postingUrl || `https://jobs.smartrecruiters.com/${encodeURIComponent(company)}/${encodeURIComponent(String(row.id))}`);
    return normalizedJob({
      id: String(row.id || row.uuid || sourceUrl), title: String(row.name || "Untitled role"),
      location, workplace: row.location?.remote ? "remote" : row.location?.hybrid ? "hybrid" : null,
      employment: String(row.typeOfEmployment?.label || "") || null,
      departments: [row.department?.label, row.function?.label].filter(Boolean).map(String),
      sourceUrl, applyUrl: String(row.applyUrl || sourceUrl), publishedAt: row.releasedDate || null,
      publishedPrecision: "instant", publishedSource: "smartrecruiters.releasedDate", raw: row,
      parseRequirements: false,
    });
  });
}

async function hydrateSmartRecruitersJob(source: { config?: JsonRecord }, job: NormalizedSourceJob) {
  const company = String(source.config?.company || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(company)) throw new Error("Invalid SmartRecruiters company identifier");
  const row = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings/${encodeURIComponent(job.source_job_id)}`) as JsonRecord;
  const sections = row.jobAd?.sections && typeof row.jobAd.sections === "object" ? Object.values(row.jobAd.sections) as JsonRecord[] : [];
  const html = sections.map(section => `${section.title ? `<h2>${section.title}</h2>` : ""}${section.text || ""}`).join("\n");
  return normalizedJob({
    id: job.source_job_id, title: String(row.name || job.title), html,
    location: String(row.location?.fullLocation || job.location || "") || null,
    workplace: row.location?.remote ? "remote" : row.location?.hybrid ? "hybrid" : job.workplace_type,
    employment: String(row.typeOfEmployment?.label || job.employment_type || "") || null,
    departments: [row.department?.label, row.function?.label].filter(Boolean).map(String),
    sourceUrl: String(row.postingUrl || job.source_url), applyUrl: String(row.applyUrl || row.postingUrl || job.apply_url),
    publishedAt: row.releasedDate || job.source_published_at, publishedPrecision: "instant",
    publishedSource: "smartrecruiters.releasedDate", raw: row,
  });
}

function safePublicOrigin(value: unknown) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:" || isIP(url.hostname) || url.hostname === "localhost") throw new Error("Invalid public careers origin");
  return url.origin;
}

async function fetchJibe(config: JsonRecord = {}, context: SourceScanContext = {}): Promise<NormalizedSourceJob[]> {
  const origin = safePublicOrigin(config.baseUrl);
  const requested = Number(context.maxJobs || config.maxJobs || 100);
  const maxJobs = Math.max(1, Math.min(Number.isFinite(requested) ? requested : 100, 100));
  const params = new URLSearchParams({ limit: String(maxJobs), page: "1", sort_by: "recent" });
  const payload = await fetchJson(`${origin}/api/jobs?${params}`) as JsonRecord;
  return (Array.isArray(payload.jobs) ? payload.jobs : []).slice(0, maxJobs).flatMap((wrapper: JsonRecord) => {
    const row = wrapper?.data && typeof wrapper.data === "object" ? wrapper.data : wrapper;
    const id = String(row.req_id || row.slug || "").trim();
    if (!id || !String(row.title || "").trim()) return [];
    const canonical = String(row.meta_data?.canonical_url || `${origin}/jobs/${encodeURIComponent(String(row.slug || id))}`);
    // Jibe's `description` is the canonical complete posting. Its separate
    // responsibilities/qualifications fields can be overlapping slices (and,
    // on AMD, `qualifications` is actually legal footer copy), so appending
    // them duplicates and mis-sections the posting.
    const html = String(row.description || row.responsibilities || row.qualifications || "");
    const locationType = String(row.location_type || "").toLowerCase().replace(/_/g, "-");
    const workplace = ["remote", "hybrid", "on-site", "onsite"].includes(locationType)
      ? locationType === "onsite" ? "on-site" : locationType
      : null;
    return [normalizedJob({
      id,
      title: String(row.title),
      html,
      location: String(row.full_location || row.location_name || [row.city, row.state, row.country].filter(Boolean).join(", ") || "") || null,
      workplace,
      employment: String(row.employment_type || "") || null,
      departments: [row.department, row.category, ...(Array.isArray(row.categories) ? row.categories : [])].filter(Boolean).map(String),
      sourceUrl: canonical,
      applyUrl: String(row.apply_url || canonical),
      publishedAt: timestampIso(row.posted_date || row.create_date),
      publishedPrecision: "instant",
      publishedSource: "jibe.posted_date",
      updatedAt: timestampIso(row.update_date || row.meta_data?.last_mod),
      raw: row,
      parseRequirements: false,
    })];
  });
}

function timestampIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : /^\d+$/.test(String(value)) ? Number(value) : null;
  const date = numeric !== null
    ? new Date(numeric > 10_000_000_000 ? numeric : numeric * 1_000)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function eightfoldValue(row: JsonRecord, ...keys: string[]) {
  return keys.map(key => row[key]).find(value => value !== null && value !== undefined && value !== "");
}

function eightfoldJobId(row: JsonRecord): string {
  return String(eightfoldValue(row, "atsJobId", "ats_job_id", "displayJobId", "display_job_id", "id", "canonicalPositionUrl", "positionUrl") || "");
}

function eightfoldRows(payload: JsonRecord): { rows: JsonRecord[]; total: number | null; sortBy: string | null } {
  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
  const rows = Array.isArray(data.positions) ? data.positions : Array.isArray(data.jobs) ? data.jobs : [];
  const totalValue = data.count ?? data.totalJobs ?? data.total ?? payload.count ?? payload.totalJobs ?? payload.total;
  const total = Number.isFinite(Number(totalValue)) ? Number(totalValue) : null;
  return { rows, total, sortBy: String(data.sortBy || data.sort_by || "").toLowerCase() || null };
}

async function scanEightfold(config: JsonRecord = {}, context: SourceScanContext = {}): Promise<SourceScanBatch> {
  const apiUrl = String(config.apiUrl || "");
  const domain = String(config.domain || "");
  const origin = String(config.origin || "").replace(/\/$/, "");
  if (!/^https:\/\/[A-Za-z0-9.-]+\/api\/pcsx\/search$/.test(apiUrl) || !domain || !origin) throw new Error("Invalid Eightfold careers source");
  const configuredMax = Number(context.maxJobs || config.maxJobs || 100);
  const maxJobs = Math.max(10, Math.min(Number.isFinite(configuredMax) ? configuredMax : 100, 100));
  const known = context.knownJobIds || new Set<string>();
  const dueReconcile = !context.lastFullScanAt || Date.now() - new Date(context.lastFullScanAt).getTime() >= 24 * 60 * 60 * 1_000;
  const mode: SourceScanMode = context.mode || (!known.size ? "bootstrap" : dueReconcile ? "reconcile" : "incremental");
  const firstUrl = new URL(apiUrl);
  firstUrl.search = new URLSearchParams({ domain, query: "", location: "", start: "0" }).toString();
  const first = eightfoldRows(await fetchJson(firstUrl.toString()) as JsonRecord);
  const pageSize = Math.max(1, first.rows.length);
  const timestampSorted = first.sortBy === "timestamp";
  const fullScan = mode !== "incremental" || !known.size || !timestampSorted;
  const targetPages = Math.max(1, Math.min(Math.ceil(maxJobs / pageSize), fullScan ? Math.ceil(maxJobs / pageSize) : 3));
  const pages: JsonRecord[][] = [first.rows];
  for (let page = 1; page < targetPages; page += 1) {
    const url = new URL(apiUrl);
    url.search = new URLSearchParams({ domain, query: "", location: "", start: String(page * pageSize) }).toString();
    const next = eightfoldRows(await fetchJson(url.toString()) as JsonRecord);
    pages.push(next.rows);
    if (next.rows.length < pageSize) break;
  }
  const deduped = new Map<string, JsonRecord>();
  pages.flat().forEach(row => { const id = eightfoldJobId(row); if (id) deduped.set(id, row); });
  const jobs = Array.from(deduped.values()).map(row => {
    const id = eightfoldJobId(row);
    const path = String(eightfoldValue(row, "canonicalPositionUrl", "positionUrl", "canonical_position_url", "position_url", "url") || "");
    const sourceUrl = path ? new URL(path, origin).toString() : `${origin}/careers/job/${encodeURIComponent(String(row.id || id))}`;
    const locations = eightfoldValue(row, "locations", "standardizedLocations", "standardized_locations");
    return normalizedJob({
      id,
      title: String(eightfoldValue(row, "name", "postingName", "posting_name", "title") || "Untitled role"),
      html: String(eightfoldValue(row, "jobDescription", "job_description", "description") || ""),
      location: Array.isArray(locations) ? locations.filter(Boolean).join("; ") : String(eightfoldValue(row, "location") || "") || null,
      workplace: String(eightfoldValue(row, "workLocationOption", "work_location_option", "locationFlexibility", "location_flexibility") || "") || null,
      employment: String(eightfoldValue(row, "employmentType", "employment_type", "efcustom_text_employment_type", "type") || "") || null,
      departments: [eightfoldValue(row, "department", "jobFunction", "job_function"), eightfoldValue(row, "businessUnit", "business_unit")].filter(Boolean).map(String),
      sourceUrl,
      applyUrl: sourceUrl,
      publishedAt: timestampIso(eightfoldValue(row, "postedTs", "posted_ts", "externallyPostedTs", "externally_posted_ts", "tCreate", "t_create", "creationTs", "created_at")),
      publishedPrecision: "instant",
      publishedSource: "eightfold.postedTs",
      updatedAt: timestampIso(eightfoldValue(row, "tUpdate", "t_update", "updatedAt", "updated_at")),
      raw: row,
      parseRequirements: false,
    });
  });
  return { jobs, meta: {
    strategy: fullScan ? "pcsx_recent_window" : "pcsx_timestamp_frontier",
    mode, fullScan, authoritative: false, boardTotal: first.total,
    enumeratedCount: jobs.length, pagesFetched: pages.length,
    state: { timestampSorted, frontierPages: fullScan ? Math.min(pages.length, 3) : Number(context.scanState?.frontierPages || 3) },
    warnings: first.total !== null && first.total > jobs.length ? [`Eightfold exposes ${first.total} jobs; AppliHero retained the newest ${jobs.length} in this bounded scan.`] : [],
  } };
}

function workdayConfig(config: JsonRecord = {}) {
  const host = String(config.host || "").toLowerCase().trim();
  const tenant = String(config.tenant || "").trim();
  const site = String(config.site || "").trim();
  if (!/^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/.test(host) || isIP(host)) throw new Error("Invalid Workday careers host");
  if (!/^[A-Za-z0-9_-]+$/.test(tenant) || !/^[A-Za-z0-9_-]+$/.test(site)) throw new Error("Invalid Workday careers site");
  return { host, tenant, site };
}

function workdayApiBase(config: JsonRecord = {}) {
  const { host, tenant, site } = workdayConfig(config);
  return `https://${host}/wday/cxs/${encodeURIComponent(tenant)}/${encodeURIComponent(site)}`;
}

async function fetchWorkdayJson(url: string, body?: JsonRecord) {
  // Workday boards commonly reject large page sizes and will occasionally
  // throttle a short burst of public detail requests. Keep retries local to
  // one request so a source can resume cleanly on its next scheduled scan.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), "User-Agent": "AppliHero Job Monitor/1.0" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) return response.json() as Promise<JsonRecord>;
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1)));
      continue;
    }
    throw new Error(`Workday careers source returned ${response.status}`);
  }
  throw new Error("Workday careers source could not be reached");
}

function workdayAgeDays(value: unknown): number | null {
  const label = String(value || "").toLowerCase();
  if (label.includes("today")) return 0;
  if (label.includes("yesterday")) return 1;
  const match = label.match(/(\d+)\s+days?\s+ago/);
  return match ? Number(match[1]) : null;
}

function workdayRelativeDate(value: unknown): string | null {
  const age = workdayAgeDays(value);
  if (age === null) return null;
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - age);
  return date.toISOString();
}

function workdayOrdering(rows: JsonRecord[]) {
  const ages = rows.map(row => workdayAgeDays(row.postedOn));
  let comparable = 0;
  let monotonic = 0;
  ages.slice(0, -1).forEach((age, index) => {
    const next = ages[index + 1];
    if (age === null || next === null) return;
    comparable += 1;
    if (next >= age) monotonic += 1;
  });
  const todayLast = ages.reduce<number>((last, age, index) => age === 0 ? index : last, -1);
  return {
    confidence: comparable ? monotonic / comparable : null,
    frontierPages: Math.max(3, todayLast >= 0 ? Math.ceil((todayLast + 1) / 20) + 2 : 3),
  };
}

async function scanWorkday(config: JsonRecord = {}, context: SourceScanContext = {}): Promise<SourceScanBatch> {
  const requestedLimit = Number(context.maxJobs || config.maxJobs || 100);
  const maxJobs = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 100;
  const known = context.knownJobIds || new Set<string>();
  const priorConfidence = Number(context.scanState?.orderingConfidence || 0);
  const dueReconcile = !context.lastFullScanAt || Date.now() - new Date(context.lastFullScanAt).getTime() >= 24 * 60 * 60 * 1_000;
  const mode: SourceScanMode = context.mode || (!known.size ? "bootstrap" : dueReconcile ? "reconcile" : "incremental");
  const fullScan = mode !== "incremental" || !known.size || priorConfidence < 0.95;
  const pageSize = Math.min(20, maxJobs);
  const first = await fetchWorkdayJson(`${workdayApiBase(config)}/jobs`, { appliedFacets: {}, limit: pageSize, offset: 0, searchText: "" });
  const boardTotal = Number.isFinite(Number(first.total)) ? Number(first.total) : null;
  const postings: JsonRecord[] = Array.isArray(first.jobPostings) ? [...first.jobPostings] : [];
  const totalPages = Math.max(1, Math.min(Math.ceil(Math.min(boardTotal || maxJobs, maxJobs) / pageSize), Math.ceil(maxJobs / pageSize)));
  let targetPages = fullScan ? totalPages : Math.min(totalPages, Math.max(3, Number(context.scanState?.frontierPages || 3)));
  let page = 1;
  while (page < targetPages) {
    const offset = page * pageSize;
    const payload = await fetchWorkdayJson(`${workdayApiBase(config)}/jobs`, { appliedFacets: {}, limit: Math.min(pageSize, maxJobs - offset), offset, searchText: "" });
    const next = Array.isArray(payload.jobPostings) ? payload.jobPostings : [];
    postings.push(...next);
    page += 1;
    if (next.length < pageSize) break;
    if (!fullScan && page === targetPages) {
      const tail = next.map((row: JsonRecord) => String(row.bulletFields?.[0] || row.externalPath || "")).filter(Boolean);
      if (tail.some((id: string) => !known.has(id)) && targetPages < totalPages) targetPages = Math.min(totalPages, targetPages + 2);
    }
  }
  const { host, site } = workdayConfig(config);
  const deduped = new Map<string, JsonRecord>();
  postings.forEach(row => {
    const key = String(row.bulletFields?.[0] || row.externalPath || "");
    if (key) deduped.set(key, row);
  });
  const rows = Array.from(deduped.values()).slice(0, maxJobs);
  const jobs = rows.map((row: JsonRecord) => {
    const externalPath = String(row.externalPath || "");
    const jobReqId = String(row.bulletFields?.[0] || row.jobReqId || externalPath);
    const sourceUrl = new URL(`/${encodeURIComponent(site)}${externalPath}`, `https://${host}`).toString();
    return normalizedJob({
      id: jobReqId, title: String(row.title || "Untitled role"), location: String(row.locationsText || "") || null,
      sourceUrl, applyUrl: sourceUrl, publishedAt: workdayRelativeDate(row.postedOn),
      publishedPrecision: "relative_day", publishedSource: "workday.postedOn", raw: row, parseRequirements: false,
    });
  });
  const ordering = workdayOrdering(rows);
  return { jobs, meta: {
    strategy: fullScan ? "workday_bounded_reconcile" : "workday_incremental_frontier",
    mode, fullScan, authoritative: false, boardTotal,
    enumeratedCount: jobs.length, pagesFetched: page,
    state: { orderingConfidence: fullScan ? ordering.confidence : priorConfidence, frontierPages: fullScan ? ordering.frontierPages : Number(context.scanState?.frontierPages || ordering.frontierPages) },
    warnings: boardTotal !== null && boardTotal > jobs.length ? [`Workday reports ${boardTotal} roles; this scan retained the newest ${jobs.length}.`] : [],
  } };
}

async function hydrateWorkdayJob(source: { config?: JsonRecord }, job: NormalizedSourceJob): Promise<NormalizedSourceJob> {
  const config = source.config || {};
  const externalPath = String((job.raw_payload as JsonRecord)?.externalPath || "");
  if (!/^\/job\/[A-Za-z0-9_./-]+$/.test(externalPath)) throw new Error("Invalid Workday job path");
  const payload = await fetchWorkdayJson(`${workdayApiBase(config)}${externalPath}`);
  const info = payload.jobPostingInfo as JsonRecord | undefined;
  if (!info) throw new Error(`Workday job ${job.source_job_id} is unavailable`);
  const { host, site } = workdayConfig(config);
  const sourceUrl = String(info.externalUrl || new URL(`/${encodeURIComponent(site)}${externalPath}`, `https://${host}`).toString());
  return normalizedJob({
    id: String(info.jobReqId || job.source_job_id), title: String(info.title || job.title), html: String(info.jobDescription || ""),
    location: [info.location, ...(Array.isArray(info.additionalLocations) ? info.additionalLocations : [])].filter(Boolean).join("; ") || job.location,
    employment: String(info.timeType || "") || job.employment_type, sourceUrl, applyUrl: sourceUrl,
    publishedAt: String(info.startDate || "") || null, deadline: String(info.endDate || "") || null,
    publishedPrecision: info.startDate ? "day" : job.source_published_precision,
    publishedSource: info.startDate ? "workday.startDate" : job.source_published_source,
    raw: { ...job.raw_payload, ...info },
  });
}

function attributesFor(row: JsonRecord): Map<string, unknown> {
  return new Map((Array.isArray(row.docattributes) ? row.docattributes : []).flatMap((item: JsonRecord) =>
    item && typeof item === "object" ? Object.entries(item) : []
  ));
}

async function fetchIbm(config: JsonRecord = {}): Promise<NormalizedSourceJob[]> {
  const appId = String(config.appId || "careers");
  const scope = String(config.scope || "careers2");
  const requestedLimit = Number(config.maxJobs);
  const maxJobs = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 2_000) : 2_000;
  const pageSize = Math.min(500, maxJobs);
  const metadata = "dcdate,expiredate,field_keyword_05,field_keyword_08,field_keyword_17,field_keyword_18,field_keyword_19,field_text_01,raw_body";
  const endpoint = (from: number, count: number, query: string) => {
    const params = new URLSearchParams({
      scope, appid: appId, fr: String(from), nr: String(count), page: String(Math.floor(from / pageSize) + 1),
      query, ql: "zz", rmdt: metadata,
    });
    return `https://www-api.ibm.com/search/api/v1-1/ibmcom/appid/${encodeURIComponent(appId)}/responseFormat/json?${params}`;
  };
  const queries = Array.isArray(config.searchQueries) && config.searchQueries.length
    ? config.searchQueries.map(String)
    : [String(config.searchQuery || "")];
  const rowsById = new Map<string, JsonRecord>();
  for (const query of queries) {
    const first = await fetchJson(endpoint(0, pageSize, query)) as JsonRecord;
    const firstResults = first.resultset?.searchresults || {};
    const total = Math.min(Number(firstResults.totalresults || 0), maxJobs);
    const queryRows: JsonRecord[] = [...(firstResults.searchresultlist || [])];
    const offsets: number[] = [];
    for (let from = queryRows.length; from < total; from += pageSize) offsets.push(from);
    const remaining = await Promise.all(offsets.map(from => fetchJson(endpoint(from, Math.min(pageSize, total - from), query)) as Promise<JsonRecord>));
    for (const payload of remaining) queryRows.push(...(payload.resultset?.searchresults?.searchresultlist || []));
    for (const row of queryRows) rowsById.set(String(row.id || row.url), row);
  }
  const rows = Array.from(rowsById.values()).slice(0, maxJobs);

  return rows.map(row => {
    const attributes = attributesFor(row);
    const jobId = String(attributes.get("field_text_01") || new URL(row.url).searchParams.get("jobId") || row.id);
    const descriptionHtml = String(attributes.get("raw_body") || row.description || "");
    const sourceUrl = `https://careers.ibm.com/en_US/careers/JobDetail?jobId=${encodeURIComponent(jobId)}&source=WEB_Search_NA`;
    return normalizedJob({
      id: jobId,
      title: String(row.title || "Untitled role"),
      html: descriptionHtml,
      location: String(attributes.get("field_keyword_19") || attributes.get("field_keyword_05") || "") || null,
      workplace: String(attributes.get("field_keyword_17") || "") || null,
      employment: String(attributes.get("field_keyword_18") || "") || null,
      departments: [String(attributes.get("field_keyword_08") || "")].filter(Boolean),
      sourceUrl,
      applyUrl: sourceUrl,
      publishedAt: String(attributes.get("dcdate") || "") || null,
      deadline: String(attributes.get("expiredate") || "") || null,
      raw: row,
      parseRequirements: false,
    });
  });
}

function safeOracleHost(value: unknown, allowBranded = false) {
  const host = String(value || "").toLowerCase().trim();
  const validOracleCloud = /^[a-z0-9.-]+\.oraclecloud\.com$/.test(host);
  const validBranded = allowBranded && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host);
  if ((!validOracleCloud && !validBranded) || isIP(host) || host === "localhost") throw new Error("Invalid Oracle careers host");
  return host;
}

async function fetchOracleJson(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "ora-irc-language": "en",
      "ora-irc-cx-userid": `applihero-${crypto.randomUUID()}`,
      "User-Agent": "AppliHero Job Monitor/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Oracle careers source returned ${response.status}`);
  return response.json() as Promise<JsonRecord>;
}

async function fetchOracle(config: JsonRecord = {}): Promise<NormalizedSourceJob[]> {
  const apiHost = safeOracleHost(config.apiHost, config.allowBrandedHost === true);
  const siteNumber = String(config.siteNumber || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(siteNumber)) throw new Error("Invalid Oracle careers site number");
  const displayBaseUrl = String(config.displayBaseUrl || `https://${apiHost}/hcmUI/CandidateExperience/en/sites/${siteNumber}`).replace(/\/$/, "");
  const requestedLimit = Number(config.maxJobs);
  const maxJobs = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 500;
  const queries = Array.isArray(config.searchQueries) && config.searchQueries.length ? config.searchQueries.map(String) : [""];
  const rows = new Map<string, JsonRecord>();
  for (const keyword of queries) {
    const finder = `findReqs;siteNumber=${siteNumber},sortBy=POSTING_DATES_DESC,limit=${maxJobs},offset=0${keyword ? `,keyword=${keyword}` : ""}`;
    const url = `https://${apiHost}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=${encodeURIComponent(finder)}`;
    const payload = await fetchOracleJson(url);
    for (const row of payload.items?.[0]?.requisitionList || []) rows.set(String(row.Id), row);
  }
  return Array.from(rows.values()).slice(0, maxJobs).map(row => {
    const sourceUrl = `${displayBaseUrl}/job/${encodeURIComponent(String(row.Id))}`;
    return normalizedJob({
      id: String(row.Id),
      title: String(row.Title || "Untitled role"),
      description: String(row.ShortDescriptionStr || ""),
      location: String(row.PrimaryLocation || "") || null,
      workplace: String(row.WorkplaceType || "") || null,
      employment: String(row.JobSchedule || row.JobType || "") || null,
      departments: [row.JobFamily, row.JobFunction].filter(Boolean).map(String),
      sourceUrl,
      applyUrl: sourceUrl,
      publishedAt: String(row.PostedDate || "") || null,
      deadline: String(row.PostingEndDate || "") || null,
      raw: row,
      parseRequirements: false,
    });
  });
}

async function fetchAmazon(config: JsonRecord = {}): Promise<NormalizedSourceJob[]> {
  const requestedLimit = Number(config.maxJobs);
  const maxJobs = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 1_000) : 500;
  const pageSize = Math.min(100, maxJobs);
  const queries = Array.isArray(config.searchQueries) && config.searchQueries.length
    ? config.searchQueries.map(String)
    : [String(config.searchQuery || "")];
  const rows = new Map<string, JsonRecord>();
  for (const query of queries) {
    let offset = 0;
    const queryLimit = Math.max(pageSize, Math.ceil(maxJobs / queries.length));
    while (offset < queryLimit && rows.size < maxJobs) {
      const params = new URLSearchParams({
        base_query: query,
        loc_query: String(config.locationQuery || ""),
        offset: String(offset),
        result_limit: String(Math.min(pageSize, queryLimit - offset)),
      });
      const payload = await fetchJson(`https://www.amazon.jobs/en/search.json?${params}`) as JsonRecord;
      const page = Array.isArray(payload.jobs) ? payload.jobs : [];
      for (const row of page) rows.set(String(row.id_icims || row.id || row.job_path), row);
      offset += page.length;
      if (!page.length || offset >= Number(payload.hits || 0)) break;
    }
  }
  return Array.from(rows.values()).slice(0, maxJobs).map(row => {
    const sourceUrl = new URL(String(row.job_path || `/en/jobs/${row.id_icims}`), "https://www.amazon.jobs").toString();
    const html = [
      row.description,
      row.basic_qualifications ? `<h2>Basic qualifications</h2>${row.basic_qualifications}` : "",
      row.preferred_qualifications ? `<h2>Preferred qualifications</h2>${row.preferred_qualifications}` : "",
    ].filter(Boolean).join("\n");
    return normalizedJob({
      id: String(row.id_icims || row.id || sourceUrl),
      title: String(row.title || "Untitled role"),
      html,
      location: String(row.location || row.normalized_location || "") || null,
      employment: String(row.job_schedule_type || "") || null,
      departments: [row.job_category, row.job_family, row.business_category].filter(Boolean).map(String),
      sourceUrl,
      applyUrl: String(row.url_next_step || sourceUrl),
      publishedAt: row.posted_date ? new Date(String(row.posted_date).replace(/\s+/g, " ")).toISOString() : null,
      raw: row,
      parseRequirements: false,
    });
  });
}

async function hydrateOracleJob(source: { config?: JsonRecord }, job: NormalizedSourceJob): Promise<NormalizedSourceJob> {
  const config = source.config || {};
  const apiHost = safeOracleHost(config.apiHost, config.allowBrandedHost === true);
  const siteNumber = String(config.siteNumber || "").trim();
  const finder = `ById;Id="${job.source_job_id}",siteNumber=${siteNumber}`;
  const url = `https://${apiHost}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=${encodeURIComponent(finder)}`;
  const payload = await fetchOracleJson(url);
  const row = payload.items?.[0];
  if (!row) throw new Error(`Oracle job ${job.source_job_id} no longer exists`);
  const html = [row.ExternalDescriptionStr, row.ExternalResponsibilitiesStr, row.ExternalQualificationsStr].filter(Boolean).join("\n");
  return normalizedJob({
    id: job.source_job_id,
    title: String(row.Title || job.title),
    html,
    location: String(row.PrimaryLocation || job.location || "") || null,
    workplace: String(row.WorkplaceType || job.workplace_type || "") || null,
    employment: String(row.JobSchedule || row.JobType || job.employment_type || "") || null,
    departments: [row.Category, row.JobFunction, row.Department].filter(Boolean).map(String),
    sourceUrl: job.source_url,
    applyUrl: job.apply_url,
    publishedAt: String(row.ExternalPostedStartDate || job.source_published_at || "") || null,
    deadline: String(row.ExternalPostedEndDate || job.application_deadline || "") || null,
    raw: row,
  });
}

async function fetchSuccessFactors(config: JsonRecord = {}): Promise<NormalizedSourceJob[]> {
  const origin = safePublicOrigin(config.baseUrl);
  const requested = Number(config.maxJobs || 100);
  const maxJobs = Math.max(1, Math.min(Number.isFinite(requested) ? requested : 100, 100));
  const jobs = new Map<string, NormalizedSourceJob>();
  for (let start = 0; start < maxJobs; start += 25) {
    const url = new URL(String(config.searchPath || "/search/"), origin);
    url.searchParams.set("q", "");
    url.searchParams.set("sortColumn", "referencedate");
    url.searchParams.set("sortDirection", "desc");
    url.searchParams.set("startrow", String(start));
    const page = await fetchCareerHtml(url);
    const anchors = Array.from(page.html.matchAll(/<a\b[^>]*class=["'][^"']*jobTitle-link[^"']*["'][^>]*>[\s\S]*?<\/a>|<a\b[^>]*href=["'][^"']*\/job\/[^"']*["'][^>]*class=["'][^"']*jobTitle-link[^"']*["'][^>]*>[\s\S]*?<\/a>/gi));
    let added = 0;
    for (const match of anchors) {
      const href = match[0].match(/href=["']([^"']+)/i)?.[1];
      if (!href) continue;
      const sourceUrl = new URL(htmlToPlainText(href), page.finalUrl).toString();
      const id = new URL(sourceUrl).pathname.match(/\/(\d+)\/?$/)?.[1] || sourceUrl;
      const title = htmlToPlainText(match[0]).trim();
      if (!title || jobs.has(id)) continue;
      jobs.set(id, normalizedJob({ id, title, sourceUrl, applyUrl: sourceUrl, raw: { sourceUrl, title }, parseRequirements: false }));
      added += 1;
    }
    if (!added || jobs.size >= maxJobs) break;
  }
  return Array.from(jobs.values()).slice(0, maxJobs);
}

async function hydrateSuccessFactorsJob(_source: { config?: JsonRecord }, job: NormalizedSourceJob) {
  const page = await fetchCareerHtml(new URL(job.source_url));
  const posting = schemaPostings(page.html)[0];
  if (!posting) {
    const descriptionStart = page.html.search(/<span\b[^>]*class=["'][^"']*jobdescription[^"']*["'][^>]*>/i);
    const descriptionEnd = descriptionStart >= 0
      ? page.html.slice(descriptionStart).search(/<p\b[^>]*class=["'][^"']*job-location/i)
      : -1;
    const descriptionHtml = descriptionStart >= 0 && descriptionEnd > 0
      ? page.html.slice(descriptionStart, descriptionStart + descriptionEnd).replace(/<(?:script|style)\b[\s\S]*?<\/(?:script|style)>/gi, "")
      : "";
    const publishedAt = page.html.match(/itemprop=["']datePosted["'][^>]*content=["']([^"']+)/i)?.[1] || null;
    const locationHtml = page.html.match(/itemprop=["']jobLocation["'][^>]*>([\s\S]*?)<\//i)?.[1] || "";
    if (!descriptionHtml) return job;
    return normalizedJob({
      id: job.source_job_id,
      title: job.title,
      html: descriptionHtml,
      location: htmlToPlainText(locationHtml).trim() || job.location,
      sourceUrl: page.finalUrl.toString(),
      applyUrl: page.finalUrl.toString(),
      publishedAt,
      publishedSource: publishedAt ? "successfactors.datePosted" : null,
      raw: { sourceUrl: page.finalUrl.toString(), publishedAt },
    });
  }
  const address = Array.isArray(posting.jobLocation) ? posting.jobLocation[0]?.address : posting.jobLocation?.address;
  const location = typeof address === "string" ? address : [address?.addressLocality, address?.addressRegion, address?.addressCountry].filter(Boolean).join(", ");
  return normalizedJob({
    id: job.source_job_id,
    title: String(posting.title || job.title),
    html: String(posting.description || ""),
    location: location || job.location,
    employment: Array.isArray(posting.employmentType) ? posting.employmentType.join(", ") : posting.employmentType || job.employment_type,
    sourceUrl: String(posting.url || page.finalUrl),
    applyUrl: String(posting.url || page.finalUrl),
    publishedAt: posting.datePosted || job.source_published_at,
    deadline: posting.validThrough || job.application_deadline,
    raw: posting,
  });
}

function schemaValues(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.flatMap(schemaValues);
  if (!value || typeof value !== "object") return [];
  const record = value as JsonRecord;
  if (record["@type"] === "JobPosting" || (Array.isArray(record["@type"]) && record["@type"].includes("JobPosting"))) return [record];
  return record["@graph"] ? schemaValues(record["@graph"]) : [];
}

function schemaPostings(html: string): JsonRecord[] {
  const blocks = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  return blocks.flatMap(match => {
    try { return schemaValues(JSON.parse(match[1])); } catch { return []; }
  });
}

function htmlAttribute(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tag.match(new RegExp(`${escaped}=["']([^"']+)["']`, "i"))?.[1] || null;
}

function jobPathLooksSpecific(url: URL): boolean {
  const path = url.pathname.replace(/\/$/, "");
  if (/\/(?:search|all-jobs|job-search|careers|jobs)$/i.test(path)) return false;
  return /\/(?:details?|jobdetail|positions?|roles?|search)\/[A-Za-z0-9_-]{3,}/i.test(path)
    || /\/jobs?\/(?:[^/]+\/)*[A-Za-z0-9_-]*(?:\d{4,}|[0-9a-f]{8}-[0-9a-f-]{20,})[A-Za-z0-9_-]*/i.test(path)
    || /\/careers\/[A-Za-z0-9_-]+_[0-9a-f-]{20,}$/i.test(path);
}

function titleFromJobUrl(url: URL): string {
  const segment = url.pathname.split("/").filter(Boolean).reverse()
    .find(value => !/^\d+$/.test(value) && !/^[0-9a-f-]{20,}$/i.test(value)) || "Open role";
  return decodeURIComponent(segment).replace(/[-_]+/g, " ").replace(/\b\w/g, value => value.toUpperCase());
}

function linkedJobPostings(html: string, finalUrl: URL, maxJobs: number): NormalizedSourceJob[] {
  const jobs = new Map<string, NormalizedSourceJob>();
  const anchors = html.matchAll(/<a\b[^>]*href=["'][^"'#]+["'][^>]*>[\s\S]*?<\/a>/gi);
  for (const match of anchors) {
    const href = htmlAttribute(match[0], "href");
    if (!href) continue;
    let jobUrl: URL;
    try { jobUrl = new URL(htmlToPlainText(href), finalUrl); } catch { continue; }
    if (jobUrl.protocol !== "https:" || !jobPathLooksSpecific(jobUrl)) continue;
    if (/linkedin\.com|indeed\.com|glassdoor\.com|facebook\.com/i.test(jobUrl.hostname)) continue;
    jobUrl.hash = "";
    const titleText = htmlToPlainText(match[0]).replace(/\s+/g, " ").trim();
    const title = titleText.length >= 3 && titleText.length <= 180 && !/^(?:apply|learn more|view|read more)$/i.test(titleText)
      ? titleText : titleFromJobUrl(jobUrl);
    const id = jobUrl.pathname.match(/(?:details?|jobdetail|positions?|roles?|search)\/([^/?#]+)/i)?.[1]
      || jobUrl.pathname.match(/(\d{4,}|[0-9a-f]{8}-[0-9a-f-]{20,})/i)?.[1]
      || jobUrl.toString();
    if (!jobs.has(id)) jobs.set(id, normalizedJob({
      id, title, sourceUrl: jobUrl.toString(), applyUrl: jobUrl.toString(),
      raw: { sourceUrl: jobUrl.toString(), title }, parseRequirements: false,
    }));
    if (jobs.size >= maxJobs) break;
  }
  return Array.from(jobs.values());
}

function postingFromHtml(html: string, finalUrl: URL, fallback: NormalizedSourceJob): NormalizedSourceJob {
  const posting = schemaPostings(html)[0];
  if (posting) {
    const address = Array.isArray(posting.jobLocation) ? posting.jobLocation[0]?.address : posting.jobLocation?.address;
    const location = typeof address === "string" ? address : [address?.addressLocality, address?.addressRegion, address?.addressCountry].filter(Boolean).join(", ");
    return normalizedJob({
      id: fallback.source_job_id, title: String(posting.title || fallback.title), html: String(posting.description || ""),
      location: location || fallback.location, employment: Array.isArray(posting.employmentType) ? posting.employmentType.join(", ") : posting.employmentType,
      sourceUrl: String(posting.url || finalUrl), applyUrl: String(posting.url || finalUrl), publishedAt: posting.datePosted,
      deadline: posting.validThrough, raw: posting,
    });
  }
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const metaTitle = html.match(/<meta\b[^>]*(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*content=["']([^"']+)/i)?.[1];
  const main = html.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1];
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  const content = (main || body).replace(/<(?:script|style|nav|header|footer)\b[\s\S]*?<\/(?:script|style|nav|header|footer)>/gi, "");
  const description = htmlToPlainText(content).replace(/\s+/g, " ").trim().slice(0, 80_000);
  const title = htmlToPlainText(h1 || metaTitle || "").replace(/\s+/g, " ").trim() || fallback.title;
  if (description.length < 200) return fallback;
  return normalizedJob({
    id: fallback.source_job_id, title, description, location: fallback.location,
    sourceUrl: finalUrl.toString(), applyUrl: finalUrl.toString(), raw: { sourceUrl: finalUrl.toString(), title },
  });
}

async function fetchCareerHtml(url: URL) {
  const response = await fetch(url, {
    headers: { Accept: "text/html", "User-Agent": "AppliHero Job Monitor/1.0" },
    cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Career page returned ${response.status}`);
  const finalUrl = new URL(response.url);
  if (finalUrl.protocol !== "https:" || isIP(finalUrl.hostname) || finalUrl.hostname === "localhost") throw new Error("Career page redirected to an invalid hostname");
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 2_000_000) throw new Error("Career page response is too large");
  return { html: (await response.text()).slice(0, 2_000_000), finalUrl };
}

async function fetchCareerPage(url: string, requestedMaxJobs = 100): Promise<NormalizedSourceJob[]> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || isIP(parsed.hostname) || parsed.hostname === "localhost") {
    throw new Error("Career pages must use a public HTTPS hostname");
  }
  const { html, finalUrl } = await fetchCareerHtml(parsed);
  const maxJobs = Math.max(1, Math.min(Number.isFinite(requestedMaxJobs) ? requestedMaxJobs : 100, 100));
  const postings = schemaPostings(html);
  if (!postings.length) {
    const linked = linkedJobPostings(html, finalUrl, maxJobs);
    if (linked.length) return linked;
    throw new Error("No job records or job-detail links were found on this page");
  }
  return postings.filter(row => typeof row.title === "string" && row.title.trim()).slice(0, maxJobs).map((row, index) => {
    const location = row.jobLocation?.address;
    const locationText = typeof location === "string" ? location : [location?.addressLocality, location?.addressRegion, location?.addressCountry].filter(Boolean).join(", ");
    const jobUrl = row.url || `${url}#job-${index}`;
    return normalizedJob({
      id: String(row.identifier?.value || row.identifier || jobUrl), title: row.title,
      html: row.description, location: locationText || null,
      employment: Array.isArray(row.employmentType) ? row.employmentType.join(", ") : row.employmentType,
      sourceUrl: jobUrl, applyUrl: row.url || jobUrl,
      publishedAt: row.datePosted, deadline: row.validThrough, raw: row,
      parseRequirements: false,
    });
  });
}

async function hydrateCareerSiteJob(_source: { config?: JsonRecord }, job: NormalizedSourceJob) {
  const page = await fetchCareerHtml(new URL(job.source_url));
  return postingFromHtml(page.html, page.finalUrl, job);
}

async function fetchAvature(config: JsonRecord = {}): Promise<NormalizedSourceJob[]> {
  const origin = safePublicOrigin(config.baseUrl);
  const locale = String(config.locale || "en_US").replace(/[^A-Za-z_]/g, "") || "en_US";
  const portal = String(config.portal || "careers").replace(/[^A-Za-z0-9_-]/g, "") || "careers";
  const requested = Number(config.maxJobs || 100);
  const maxJobs = Math.max(1, Math.min(Number.isFinite(requested) ? requested : 100, 100));
  const page = await fetchCareerHtml(new URL(`/${locale}/${portal}/Home/feed/?jobRecordsPerPage=${maxJobs}`, origin));
  const items = Array.from(page.html.matchAll(/<item>([\s\S]*?)<\/item>/gi)).slice(0, maxJobs);
  const xmlText = (value: string) => htmlToPlainText(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
  return items.flatMap((match, index) => {
    const item = match[1];
    const title = xmlText(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
    const link = xmlText(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] || "");
    if (!title || !link) return [];
    const id = new URL(link).pathname.match(/\/(\d+)\/?$/)?.[1] || link;
    const published = xmlText(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "");
    return [normalizedJob({
      id, title, sourceUrl: link, applyUrl: link,
      publishedAt: published ? new Date(published).toISOString() : null,
      publishedSource: published ? "avature.rss.pubDate" : null,
      raw: { index, title, link, published }, parseRequirements: false,
    })];
  });
}

async function fetchIndexedSite(config: JsonRecord = {}): Promise<NormalizedSourceJob[]> {
  const companyName = String(config.companyName || "").trim();
  const baseUrl = String(config.baseUrl || "").trim();
  if (!companyName || !baseUrl) throw new Error("Indexed career source is missing company identity");
  const official = new URL(baseUrl);
  const requested = Number(config.maxJobs || 20);
  const maxJobs = Math.max(1, Math.min(Number.isFinite(requested) ? requested : 20, 50));
  const hits = await searchOfficialCompanyJobs(companyName, baseUrl);
  const jobs = new Map<string, NormalizedSourceJob>();
  for (const hit of hits) {
    let url: URL;
    try { url = new URL(hit.url); } catch { continue; }
    const sameOrganization = url.hostname === official.hostname || url.hostname.endsWith(`.${official.hostname}`) || official.hostname.endsWith(`.${url.hostname}`);
    if (!sameOrganization || !jobPathLooksSpecific(url)) continue;
    const title = String(hit.title || titleFromJobUrl(url)).replace(/\s+[|–—-]\s+[^|–—]+$/, "").trim();
    const description = Array.isArray(hit.excerpts) ? hit.excerpts.join("\n") : "";
    const id = url.pathname.match(/(?:details?|jobdetail|positions?|roles?|search)\/([^/?#]+)/i)?.[1]
      || url.pathname.match(/(\d{4,}|[0-9a-f]{8}-[0-9a-f-]{20,})/i)?.[1]
      || url.toString();
    if (!jobs.has(id)) jobs.set(id, normalizedJob({
      id, title, description, sourceUrl: url.toString(), applyUrl: url.toString(),
      raw: { title, url: url.toString(), excerpts: hit.excerpts || [] }, parseRequirements: false,
    }));
    if (jobs.size >= maxJobs) break;
  }
  if (!jobs.size) throw new Error("Official job index returned no current job-detail pages");
  return Array.from(jobs.values());
}

export async function verifySourceConfig(source: SourceConfig) {
  const jobs = await fetchSourceJobs({ provider: source.provider, external_key: source.externalKey, career_url: source.careerUrl, config: { ...source.config, maxJobs: 1 } });
  if (!jobs.length) throw new Error("The careers source is reachable, but it has no open jobs to verify yet");
  return source;
}

export function sourceFromCareerUrl(companyName: string, rawUrl: string): SourceConfig {
  const url = new URL(rawUrl.trim());
  if (url.protocol !== "https:" || isIP(url.hostname) || url.hostname === "localhost") {
    throw new Error("Enter a public HTTPS career-page URL");
  }
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  let provider: JobProvider = "career_site";
  let externalKey = `${host}${url.pathname}`.replace(/\/$/, "");
  let config: Record<string, unknown> = { careerUrl: url.toString() };

  // A branded career landing page often redirects people into an ATS, but
  // server-side verification cannot infer that from its HTML alone. Keep a
  // known official mapping so either of NVIDIA's public entry URLs works.
  if (host === "careers.amd.com") {
    provider = "jibe";
    externalKey = "careers.amd.com";
    config = { baseUrl: "https://careers.amd.com", maxJobs: 100 };
  } else if ((host === "jobs.nvidia.com" || host.endsWith(".nvidia.com")) && /career/i.test(url.pathname)) {
    provider = "workday";
    externalKey = "nvidia/NVIDIAExternalCareerSite";
    config = { host: "nvidia.wd5.myworkdayjobs.com", tenant: "nvidia", site: "NVIDIAExternalCareerSite" };
  } else if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    provider = "greenhouse"; externalKey = parts[0] || ""; config = { boardToken: externalKey };
  } else if (host === "jobs.lever.co") {
    provider = "lever"; externalKey = parts[0] || ""; config = { site: externalKey };
  } else if (host === "jobs.ashbyhq.com") {
    provider = "ashby"; externalKey = parts[0] || ""; config = { board: externalKey };
  } else if (host === "apply.workable.com" && parts.length >= 1) {
    provider = "workable"; externalKey = parts[0]; config = { account: externalKey };
  } else if ((host === "careers.smartrecruiters.com" || host === "jobs.smartrecruiters.com") && parts.length >= 1) {
    provider = "smartrecruiters"; externalKey = parts[0]; config = { company: externalKey, maxJobs: 100 };
  } else if (host === "apply.careers.microsoft.com") {
    provider = "eightfold";
    externalKey = "microsoft.com";
    config = {
      apiUrl: "https://apply.careers.microsoft.com/api/pcsx/search",
      domain: "microsoft.com",
      origin: "https://apply.careers.microsoft.com",
      maxJobs: 100,
    };
  } else if ((host.endsWith(".eightfold.ai") || /\bjobs\b/.test(host)) && parts[0] === "careers" && url.searchParams.get("domain")) {
    const domain = String(url.searchParams.get("domain"));
    provider = "eightfold"; externalKey = `${host}/${domain}`;
    config = { apiUrl: `${url.origin}/api/pcsx/search`, domain, origin: url.origin, maxJobs: 100 };
  } else if (/^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/.test(host) && parts.length >= 1) {
    const site = parts[0];
    const tenant = host.split(".")[0];
    provider = "workday"; externalKey = `${tenant}/${site}`; config = { host, tenant, site };
  } else if ((host === "ibm.com" || host === "www.ibm.com") && url.pathname.replace(/\/$/, "") === "/careers/search") {
    provider = "ibm"; externalKey = "careers2"; config = { appId: "careers", scope: "careers2" };
  } else if (host === "careers.americanexpress.com" && parts.includes("CX_1")) {
    provider = "oracle";
    externalKey = "egug.fa.us2.oraclecloud.com/CX_1";
    config = { apiHost: "egug.fa.us2.oraclecloud.com", siteNumber: "CX_1", displayBaseUrl: "https://careers.americanexpress.com/en/sites/CX_1" };
  } else if (host.endsWith(".oraclecloud.com") && parts.includes("sites")) {
    const siteIndex = parts.indexOf("sites");
    const siteNumber = parts[siteIndex + 1] || "";
    if (/^[A-Za-z0-9_-]+$/.test(siteNumber)) {
      provider = "oracle"; externalKey = `${host}/${siteNumber}`;
      config = { apiHost: host, siteNumber, displayBaseUrl: `${url.origin}/hcmUI/CandidateExperience/en/sites/${siteNumber}` };
    }
  } else if ((host === "amazon.jobs" || host === "www.amazon.jobs") && parts.includes("search")) {
    provider = "amazon"; externalKey = "amazon-jobs"; config = { searchQueries: ["intern", "co-op", "student"] };
  }
  if (!companyName.trim() || !externalKey) throw new Error("Enter a company name and a valid career-page URL");
  return { provider, externalKey, companyName: companyName.trim(), careerUrl: url.toString(), config };
}

function companySlugs(companyName: string): string[] {
  const normalized = companyName.toLowerCase().replace(/\b(inc|incorporated|corp|corporation|company|co|llc|ltd)\b/g, " ").trim();
  return Array.from(new Set([
    normalized.replace(/[^a-z0-9]+/g, ""),
    normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  ].filter(Boolean)));
}

async function sourceExists(source: SourceConfig): Promise<boolean> {
  try {
    const jobs = await fetchSourceJobs({
      provider: source.provider,
      external_key: source.externalKey,
      career_url: source.careerUrl,
      config: { ...source.config, maxJobs: 1 },
    });
    // An empty slug-shaped ATS account is not sufficient identity evidence.
    // This specifically prevents false positives such as an empty Workable
    // account outranking AMD's real first-party iCIMS/Jibe board.
    return jobs.length > 0;
  } catch {
    return false;
  }
}

function sourceFromCareerEvidence(companyName: string, finalUrl: URL, html: string): SourceConfig {
  // Several branded Eightfold tenants serialize their bootstrap settings into
  // HTML attributes, so quotes arrive entity-encoded (for example
  // `domain&#34;: &#34;lockheedmartin.com&#34;`). Decode only the entities needed for
  // provider detection; the original document remains untouched for parsing.
  const providerEvidence = html
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/&amp;/gi, "&");
  const embeddedAts = html.match(/https:\/\/[A-Za-z0-9-]+\.wd\d+\.myworkdayjobs\.com\/[A-Za-z0-9_-]+/i)?.[0]
    || html.match(/https:\/\/(?:job-boards\.greenhouse\.io|boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|apply\.workable\.com|careers\.smartrecruiters\.com|jobs\.smartrecruiters\.com)\/[A-Za-z0-9_-]+/i)?.[0];
  if (embeddedAts) return sourceFromCareerUrl(companyName, embeddedAts);
  if (/app\.jibecdn\.com\/prod\/search|externalJobConfig|this\.http\.get\(["']\/api\/jobs/i.test(html)) {
    return {
      provider: "jibe",
      externalKey: finalUrl.hostname,
      companyName: companyName.trim(),
      careerUrl: finalUrl.toString(),
      config: { baseUrl: finalUrl.origin, maxJobs: 100 },
    };
  }
  const eightfoldDomain = finalUrl.searchParams.get("domain") || providerEvidence.match(/(?:[?&]|["']domain["']?\s*[:=]\s*["']?)([A-Za-z0-9.-]+\.[A-Za-z]{2,})/i)?.[1];
  if (eightfoldDomain && (/\/careers\b/.test(finalUrl.pathname) || /\/api\/pcsx\/search/i.test(providerEvidence))) {
    return {
      provider: "eightfold",
      externalKey: `${finalUrl.hostname}/${eightfoldDomain}`,
      companyName: companyName.trim(),
      careerUrl: finalUrl.toString(),
      config: { apiUrl: `${finalUrl.origin}/api/pcsx/search`, domain: eightfoldDomain, origin: finalUrl.origin, maxJobs: 100 },
    };
  }
  const oracleHost = html.match(/https:\/\/([a-z0-9.-]+\.oraclecloud\.com)(?::\d+)?\//i)?.[1];
  const oracleSite = html.match(/siteNumber=([A-Za-z0-9_-]+)/i)?.[1];
  if (oracleHost && oracleSite) {
    const siteAlias = finalUrl.pathname.match(/\/sites\/([^/?#]+)/i)?.[1] || oracleSite;
    return {
      provider: "oracle",
      externalKey: `${oracleHost}/${oracleSite}`,
      companyName: companyName.trim(),
      careerUrl: finalUrl.toString(),
      config: { apiHost: oracleHost, siteNumber: oracleSite, displayBaseUrl: `${finalUrl.origin}/en/sites/${siteAlias}` },
    };
  }
  const brandedOracleSite = html.match(/(?:siteNumber|sitenumber)=["']?([A-Za-z0-9_-]+)/i)?.[1];
  if (brandedOracleSite && /hcmRestApi|CandidateExperience|oj-hcm-ce/i.test(html)) {
    const siteAlias = finalUrl.pathname.match(/\/sites\/([^/?#]+)/i)?.[1] || brandedOracleSite;
    return {
      provider: "oracle",
      externalKey: `${finalUrl.hostname}/${brandedOracleSite}`,
      companyName: companyName.trim(),
      careerUrl: finalUrl.toString(),
      config: { apiHost: finalUrl.hostname, siteNumber: brandedOracleSite, displayBaseUrl: `${finalUrl.origin}/hcmUI/CandidateExperience/en/sites/${siteAlias}`, allowBrandedHost: true },
    };
  }
  if (/platform\/js\/j2w|jobTitle-link|performancemanager\d*\.successfactors\./i.test(html)) {
    return {
      provider: "successfactors",
      externalKey: finalUrl.hostname,
      companyName: companyName.trim(),
      careerUrl: finalUrl.toString(),
      config: { baseUrl: finalUrl.origin, searchPath: finalUrl.pathname.includes("/search") ? finalUrl.pathname : "/search/", maxJobs: 100 },
    };
  }
  if (/avature\.portal\.(?:id|name|urlPath)|\/careers\/Home\/feed\//i.test(providerEvidence)) {
    const locale = providerEvidence.match(/avature\.portal\.lang["']?\s*(?:content=|[:=]\s*)["']?([A-Za-z_]+)/i)?.[1] || "en_US";
    const portal = providerEvidence.match(/avature\.portal\.urlPath["']?\s*(?:content=|[:=]\s*)["']?([A-Za-z0-9_-]+)/i)?.[1]
      || finalUrl.pathname.split("/").filter(Boolean)[1] || "careers";
    return {
      provider: "avature",
      externalKey: `${finalUrl.hostname}/${portal}`,
      companyName: companyName.trim(),
      careerUrl: finalUrl.toString(),
      config: { baseUrl: finalUrl.origin, locale, portal, maxJobs: 100 },
    };
  }
  return sourceFromCareerUrl(companyName, finalUrl.toString());
}

function firstPartyCareerHit(companyName: string, rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || isIP(url.hostname)) return false;
    const denied = ["linkedin.com", "indeed.com", "glassdoor.com", "ziprecruiter.com", "github.com", "apify.com"];
    if (denied.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return false;
    const keys = companySlugs(companyName).map(slug => slug.replace(/-/g, ""));
    const labels = url.hostname.toLowerCase().split(".").map(label => label.replace(/[^a-z0-9]/g, ""));
    return keys.some(key => key.length >= 3 && labels.some(label => label === key || label === `careers${key}` || label === `jobs${key}` || label === `${key}careers` || label === `${key}jobs`));
  } catch {
    return false;
  }
}

function indexedSource(companyName: string, officialUrl: string): SourceConfig {
  const url = new URL(officialUrl);
  return {
    provider: "indexed_site",
    externalKey: `${url.hostname}${url.pathname}`.replace(/\/$/, ""),
    companyName: companyName.trim(),
    careerUrl: url.toString(),
    config: { companyName: companyName.trim(), baseUrl: url.toString(), maxJobs: 20 },
  };
}

async function discoverFromParallelSearch(companyName: string): Promise<SourceConfig | null> {
  const hits = await searchOfficialCompanyCareers(companyName);
  const official = hits.map(hit => hit.url).filter(url => firstPartyCareerHit(companyName, url)).slice(0, 8);
  for (const candidate of official) {
    try {
      const page = await fetchCareerHtml(new URL(candidate));
      const source = sourceFromCareerEvidence(companyName, page.finalUrl, page.html);
      if (await sourceExists(source)) return source;
      const fallback = indexedSource(companyName, page.finalUrl.toString());
      if (await sourceExists(fallback)) return fallback;
    } catch {
      // Search results are hints. Only a live, company-owned page and a
      // non-empty provider result become a persisted source.
    }
  }

  const companyKeys = companySlugs(companyName).map(slug => slug.replace(/-/g, ""));
  for (const hit of hits) {
    try {
      const source = sourceFromCareerUrl(companyName, hit.url);
      if (source.provider === "career_site") continue;
      const identity = source.externalKey.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!companyKeys.some(key => identity.includes(key))) continue;
      if (await sourceExists(source)) return source;
    } catch {
      // Direct ATS search hits receive the same live verification gate.
    }
  }
  return null;
}

async function discoverFromOfficialSites(companyName: string): Promise<SourceConfig | null> {
  const slugs = companySlugs(companyName);
  const candidates = slugs.flatMap(slug => [
    `https://www.${slug}.com/careers`,
    `https://${slug}.com/careers`,
    `https://careers.${slug}.com`,
    `https://jobs.${slug}.com`,
  ]);
  const results = await Promise.all(candidates.map(async candidate => {
    try {
      const response = await fetch(candidate, {
        headers: { Accept: "text/html", "User-Agent": "AppliHero Job Monitor/1.0" },
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return null;
      const finalUrl = new URL(response.url);
      if (finalUrl.protocol !== "https:" || isIP(finalUrl.hostname) || finalUrl.hostname === "localhost") return null;
      const html = (await response.text()).slice(0, 1_000_000);
      // Detect the major public ATS hosts from an employer's own career page.
      // Workday boards generally do not publish schema.org records, so they
      // must be recognized before falling back to generic HTML extraction.
      const atsUrls = Array.from(html.matchAll(/https:\/(?:(?:\/)(?:job-boards\.greenhouse\.io|boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|apply\.workable\.com|careers\.smartrecruiters\.com|jobs\.smartrecruiters\.com)\/[A-Za-z0-9_-]+|\/[A-Za-z0-9-]+\.wd\d+\.myworkdayjobs\.com\/[A-Za-z0-9_-]+)/gi))
        .map(match => match[0]);
      for (const atsUrl of Array.from(new Set(atsUrls))) {
        const source = sourceFromCareerUrl(companyName, atsUrl);
        if (await sourceExists(source)) return source;
      }
      const source = sourceFromCareerEvidence(companyName, finalUrl, html);
      if (await sourceExists(source)) return source;
      const fallback = indexedSource(companyName, finalUrl.toString());
      if (await sourceExists(fallback)) return fallback;
    } catch {
      // Candidate domains are intentionally best-effort; only verified feeds
      // are returned to the user for approval.
    }
    return null;
  }));
  return results.find((source): source is SourceConfig => Boolean(source)) || null;
}

export async function discoverCompanySource(companyName: string): Promise<SourceConfig> {
  const name = companyName.trim();
  if (name.length < 2) throw new Error("Enter a company name");
  const lookup = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const known = KNOWN_COMPANIES.find(company => company.aliases.includes(lookup));
  if (known) {
    const { aliases: _aliases, ...source } = known;
    return source;
  }

  const atsCandidates = companySlugs(name).flatMap(slug => [
      { provider: "greenhouse", externalKey: slug, companyName: name, careerUrl: `https://job-boards.greenhouse.io/${slug}`, config: { boardToken: slug } },
      { provider: "lever", externalKey: slug, companyName: name, careerUrl: `https://jobs.lever.co/${slug}`, config: { site: slug } },
      { provider: "ashby", externalKey: slug, companyName: name, careerUrl: `https://jobs.ashbyhq.com/${slug}`, config: { board: slug } },
      { provider: "workable", externalKey: slug, companyName: name, careerUrl: `https://apply.workable.com/${slug}`, config: { account: slug } },
      { provider: "smartrecruiters", externalKey: slug, companyName: name, careerUrl: `https://careers.smartrecruiters.com/${slug}`, config: { company: slug, maxJobs: 100 } },
    ] as SourceConfig[]);
  const checks = await Promise.all(atsCandidates.map(sourceExists));
  const match = atsCandidates[checks.findIndex(Boolean)];
  if (match) return match;
  const parallelSource = await discoverFromParallelSearch(name);
  if (parallelSource) return parallelSource;
  const officialSite = await discoverFromOfficialSites(name);
  if (officialSite) return officialSite;
  throw new Error(`We could not verify ${name}'s job source yet. Try the company's full legal name or request it for review.`);
}

function scanMeta(provider: JobProvider, jobs: NormalizedSourceJob[], context: SourceScanContext = {}): SourceScanMeta {
  const mode = context.mode || (context.knownJobIds?.size ? "incremental" : "bootstrap");
  return {
    strategy: `${provider}_public_feed`,
    mode,
    fullScan: true,
    authoritative: provider !== "career_site",
    boardTotal: jobs.length,
    enumeratedCount: jobs.length,
    pagesFetched: 1,
    state: {},
    warnings: [],
  };
}

export async function fetchSourceJobsWithMeta(
  source: { provider: JobProvider; external_key: string; career_url?: string | null; config?: JsonRecord },
  context: SourceScanContext = {},
): Promise<SourceScanBatch> {
  if (source.provider === "workday") return scanWorkday(source.config, context);
  if (source.provider === "eightfold") return scanEightfold(source.config, context);
  let jobs: NormalizedSourceJob[];
  switch (source.provider) {
    case "greenhouse": jobs = await fetchGreenhouseBoard(source.config?.boardToken || source.external_key, { parseRequirements: false }); break;
    case "lever": jobs = await fetchLever(source.config?.site || source.external_key); break;
    case "ashby": jobs = await fetchAshby(source.config?.board || source.external_key); break;
    case "workable": jobs = await fetchWorkable(source.config); break;
    case "smartrecruiters": jobs = await fetchSmartRecruiters(source.config); break;
    case "jibe": jobs = await fetchJibe(source.config, context); break;
    case "ibm": jobs = await fetchIbm(source.config); break;
    case "oracle": jobs = await fetchOracle(source.config); break;
    case "successfactors": jobs = await fetchSuccessFactors(source.config); break;
    case "amazon": jobs = await fetchAmazon(source.config); break;
    case "avature": jobs = await fetchAvature(source.config); break;
    case "indexed_site": jobs = await fetchIndexedSite(source.config); break;
    case "career_site": jobs = await fetchCareerPage(source.career_url || source.config?.careerUrl, Number(source.config?.maxJobs || context.maxJobs || 100)); break;
    default: throw new Error(`Unsupported job source: ${source.provider}`);
  }
  return { jobs, meta: scanMeta(source.provider, jobs, context) };
}

export async function fetchSourceJobs(source: { provider: JobProvider; external_key: string; career_url?: string | null; config?: JsonRecord }): Promise<NormalizedSourceJob[]> {
  return (await fetchSourceJobsWithMeta(source)).jobs;
}

export async function hydrateSourceJob(source: { provider: JobProvider; config?: JsonRecord }, job: NormalizedSourceJob) {
  if (source.provider === "smartrecruiters") return hydrateSmartRecruitersJob(source, job);
  if (source.provider === "oracle") return hydrateOracleJob(source, job);
  if (source.provider === "successfactors") return hydrateSuccessFactorsJob(source, job);
  if (source.provider === "avature") return hydrateCareerSiteJob(source, job);
  if (source.provider === "indexed_site") return hydrateCareerSiteJob(source, job);
  if (source.provider === "career_site") return hydrateCareerSiteJob(source, job);
  if (source.provider === "workday") return hydrateWorkdayJob(source, job);
  if (source.provider === "eightfold" && !job.description.trim()) {
    const [detail] = await fetchCareerPage(job.source_url);
    if (!detail) return job;
    return {
      ...job,
      description: detail.description,
      description_html: detail.description_html,
      employment_type: detail.employment_type || job.employment_type,
      application_deadline: detail.application_deadline || job.application_deadline,
      apply_url: detail.apply_url || job.apply_url,
      raw_payload: { listing: job.raw_payload, detail: detail.raw_payload } as any,
      parsed_requirements: [],
    };
  }
  return job;
}

export function prepareSourceJob(job: NormalizedSourceJob): NormalizedSourceJob {
  if (job.parsed_requirements.length && job.parser_version === REQUIREMENTS_PARSER_VERSION) return job;
  return {
    ...job,
    parsed_requirements: parseJobRequirements(job.description),
    parser_version: REQUIREMENTS_PARSER_VERSION,
    content_hash: hashText(JSON.stringify({
      title: job.title,
      description: job.description,
      location: job.location,
      updatedAt: job.source_updated_at,
      parserVersion: REQUIREMENTS_PARSER_VERSION,
    })),
  };
}
