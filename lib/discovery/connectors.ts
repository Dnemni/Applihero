import { isIP } from "node:net";
import { fetchGreenhouseBoard } from "./greenhouse";
import { hashText, htmlToPlainText, parseJobRequirements, REQUIREMENTS_PARSER_VERSION } from "./parser";
import type { JobProvider } from "./types";

export type NormalizedSourceJob = Awaited<ReturnType<typeof fetchGreenhouseBoard>>[number];

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
  updatedAt?: string | null;
  deadline?: string | null;
  raw: JsonRecord;
  parseRequirements?: boolean;
}): NormalizedSourceJob {
  const description = input.description || htmlToPlainText(input.html || "");
  const combined = `${input.title} ${input.location || ""} ${description}`;
  const inferredEmployment = employmentType(combined);
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
  };
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "AppliHero Job Monitor/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Source returned ${response.status}`);
  return response.json();
}

async function fetchLever(site: string): Promise<NormalizedSourceJob[]> {
  const rows = await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`) as JsonRecord[];
  return rows.map(row => normalizedJob({
    id: String(row.id), title: row.text, description: row.descriptionPlain,
    html: row.description, location: row.categories?.location,
    workplace: row.workplaceType, employment: row.categories?.commitment,
    departments: [row.categories?.team, row.categories?.department].filter(Boolean),
    sourceUrl: row.hostedUrl, applyUrl: row.applyUrl,
    publishedAt: row.createdAt ? new Date(row.createdAt).toISOString() : null, raw: row,
    parseRequirements: false,
  }));
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

async function fetchWorkday(config: JsonRecord = {}): Promise<NormalizedSourceJob[]> {
  const requestedLimit = Number(config.maxJobs);
  const maxJobs = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 50) : 50;
  // NVIDIA's public Workday board, and many others, return HTTP 400 for a
  // 100-item payload. Requesting pages of 20 keeps the catalog cap at 50
  // without relying on a provider-specific undocumented maximum.
  const pageSize = Math.min(20, maxJobs);
  const postings: JsonRecord[] = [];
  for (let offset = 0; offset < maxJobs; offset += pageSize) {
    const payload = await fetchWorkdayJson(`${workdayApiBase(config)}/jobs`, { limit: Math.min(pageSize, maxJobs - offset), offset, searchText: "" });
    const page = Array.isArray(payload.jobPostings) ? payload.jobPostings : [];
    postings.push(...page);
    if (page.length < pageSize) break;
  }
  const { host, site } = workdayConfig(config);
  return postings.slice(0, maxJobs).map((row: JsonRecord) => {
    const externalPath = String(row.externalPath || "");
    const jobReqId = String(row.bulletFields?.[0] || row.jobReqId || externalPath);
    const sourceUrl = new URL(`/${encodeURIComponent(site)}${externalPath}`, `https://${host}`).toString();
    return normalizedJob({ id: jobReqId, title: String(row.title || "Untitled role"), location: String(row.locationsText || "") || null, sourceUrl, applyUrl: sourceUrl, raw: row, parseRequirements: false });
  });
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

function safeOracleHost(value: unknown) {
  const host = String(value || "").toLowerCase().trim();
  if (!/^[a-z0-9.-]+\.oraclecloud\.com$/.test(host) || isIP(host)) throw new Error("Invalid Oracle careers host");
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
  const apiHost = safeOracleHost(config.apiHost);
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
  const apiHost = safeOracleHost(config.apiHost);
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

async function fetchCareerPage(url: string): Promise<NormalizedSourceJob[]> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || isIP(parsed.hostname) || parsed.hostname === "localhost") {
    throw new Error("Career pages must use a public HTTPS hostname");
  }
  const { html, finalUrl } = await fetchCareerHtml(parsed);
  let postings = schemaPostings(html);
  if (!postings.length) {
    const organizationSuffix = finalUrl.hostname.split(".").slice(-2).join(".");
    const detailUrls = Array.from(html.matchAll(/href=["']([^"'#]+)["']/gi))
      .map(match => {
        try { return new URL(match[1], finalUrl); } catch { return null; }
      })
      .filter((candidate): candidate is URL => Boolean(candidate && candidate.protocol === "https:" && (candidate.hostname === organizationSuffix || candidate.hostname.endsWith(`.${organizationSuffix}`)) && /\b(?:job|jobs|career|careers|opening|position)s?\b/i.test(candidate.pathname)))
      .filter((candidate, index, all) => all.findIndex(item => item.toString() === candidate.toString()) === index)
      .slice(0, 12);
    for (let index = 0; index < detailUrls.length && !postings.length; index += 4) {
      const pages = await Promise.all(detailUrls.slice(index, index + 4).map(async detailUrl => {
        try { return await fetchCareerHtml(detailUrl); } catch { return null; }
      }));
      postings = pages.flatMap(page => page ? schemaPostings(page.html).map(posting => ({ ...posting, url: posting.url || page.finalUrl.toString() })) : []);
    }
  }
  if (!postings.length) throw new Error("No schema.org JobPosting records were found on this page");
  return postings.filter(row => typeof row.title === "string" && row.title.trim()).map((row, index) => {
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
  if ((host === "jobs.nvidia.com" || host.endsWith(".nvidia.com")) && /career/i.test(url.pathname)) {
    provider = "workday";
    externalKey = "nvidia/NVIDIAExternalCareerSite";
    config = { host: "nvidia.wd5.myworkdayjobs.com", tenant: "nvidia", site: "NVIDIAExternalCareerSite" };
  } else if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    provider = "greenhouse"; externalKey = parts[0] || ""; config = { boardToken: externalKey };
  } else if (host === "jobs.lever.co") {
    provider = "lever"; externalKey = parts[0] || ""; config = { site: externalKey };
  } else if (host === "jobs.ashbyhq.com") {
    provider = "ashby"; externalKey = parts[0] || ""; config = { board: externalKey };
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
    return Array.isArray(jobs);
  } catch {
    return false;
  }
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
      const atsUrls = Array.from(html.matchAll(/https:\/(?:(?:\/)(?:job-boards\.greenhouse\.io|boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com)\/[A-Za-z0-9_-]+|\/[A-Za-z0-9-]+\.wd\d+\.myworkdayjobs\.com\/[A-Za-z0-9_-]+)/gi))
        .map(match => match[0]);
      for (const atsUrl of Array.from(new Set(atsUrls))) {
        const source = sourceFromCareerUrl(companyName, atsUrl);
        if (await sourceExists(source)) return source;
      }
      const source = sourceFromCareerUrl(companyName, finalUrl.toString());
      if (await sourceExists(source)) return source;
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
    ] as SourceConfig[]);
  const checks = await Promise.all(atsCandidates.map(sourceExists));
  const match = atsCandidates[checks.findIndex(Boolean)];
  if (match) return match;
  const officialSite = await discoverFromOfficialSites(name);
  if (officialSite) return officialSite;
  throw new Error(`We could not verify ${name}'s job source yet. Try the company's full legal name or request it for review.`);
}

export async function fetchSourceJobs(source: { provider: JobProvider; external_key: string; career_url?: string | null; config?: JsonRecord }): Promise<NormalizedSourceJob[]> {
  switch (source.provider) {
    case "greenhouse": return fetchGreenhouseBoard(source.config?.boardToken || source.external_key, { parseRequirements: false });
    case "lever": return fetchLever(source.config?.site || source.external_key);
    case "ashby": return fetchAshby(source.config?.board || source.external_key);
    case "workday": return fetchWorkday(source.config);
    case "ibm": return fetchIbm(source.config);
    case "oracle": return fetchOracle(source.config);
    case "amazon": return fetchAmazon(source.config);
    case "career_site": return fetchCareerPage(source.career_url || source.config?.careerUrl);
    default: throw new Error(`Unsupported job source: ${source.provider}`);
  }
}

export async function hydrateSourceJob(source: { provider: JobProvider; config?: JsonRecord }, job: NormalizedSourceJob) {
  if (source.provider === "oracle") return hydrateOracleJob(source, job);
  if (source.provider === "workday") return hydrateWorkdayJob(source, job);
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
