import { config } from "dotenv";

config({ path: ".env.local" });

const TARGET_COMPANIES = [
  "AMD", "Microsoft", "NVIDIA", "Apple", "Google", "Meta", "Amazon", "IBM", "Intel", "Salesforce",
  "Adobe", "Cisco", "Oracle", "Dell", "HP", "HPE", "Qualcomm", "Broadcom", "Uber", "Lyft",
  "Airbnb", "Stripe", "Block", "PayPal", "Visa", "Mastercard", "American Express", "Goldman Sachs", "JPMorgan Chase", "Morgan Stanley",
  "Capital One", "Walmart", "Target", "Tesla", "Rivian", "Ford", "General Motors", "Boeing", "Lockheed Martin", "Northrop Grumman",
  "RTX", "Palantir", "Datadog", "Snowflake", "MongoDB", "Confluent", "Elastic", "GitLab", "GitHub", "Atlassian",
  "Twilio", "Okta", "CrowdStrike", "Palo Alto Networks", "Zscaler", "ServiceNow", "SAP", "Spotify", "ByteDance", "TikTok",
  "Netflix", "Dropbox", "Box", "Zoom", "Pinterest", "Snap", "Reddit", "Discord", "Roblox", "Unity",
  "Electronic Arts", "Epic Games", "Duolingo", "HubSpot", "Shopify", "Coinbase", "Robinhood", "Plaid", "Ramp", "Brex",
  "Rippling", "Figma", "Canva", "Notion", "Airtable", "Asana", "Linear", "Vercel", "Cloudflare", "Fastly",
  "DigitalOcean", "Databricks", "Scale AI", "OpenAI", "Anthropic", "Cohere", "Hugging Face", "xAI", "Neuralink", "SpaceX",
] as const;

type AuditTarget = {
  company: string;
  source: any | null;
  sourceOrigin: "existing" | "discovered" | null;
  discoveryMs: number | null;
  discoveryError: string | null;
  cold: any | null;
  warm: any | null;
};

function companyKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function percentile(values: number[], proportion: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * proportion))];
}

async function mapPool<T>(items: T[], concurrency: number, work: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await work(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const scanOnly = process.argv.includes("--scan-only");
  const discoveryOnly = process.argv.includes("--discovery-only");
  const quiet = process.argv.includes("--quiet");
  if (TARGET_COMPANIES.length !== 100) throw new Error(`Expected 100 companies, received ${TARGET_COMPANIES.length}`);
  const { createClient } = await import("@supabase/supabase-js");
  const database = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const connectorModule = await import("../lib/discovery/connectors");
  const syncModule = await import("../lib/discovery/sync");
  const discoverCompanySource = (connectorModule as any).discoverCompanySource || (connectorModule as any).default?.discoverCompanySource;
  const syncSource = (syncModule as any).syncSource || (syncModule as any).default?.syncSource;

  const { data: amdRecommendation, error: userError } = await database.from("user_job_recommendations")
    .select("user_id").eq("discovery_job_id", "353307ed-c3b0-4e92-ae17-191e15ca0cd9").eq("active", true).limit(1).single();
  if (userError) throw userError;
  const userId = amdRecommendation.user_id;

  const [{ data: initialSources, error: sourceError }, { count: jobsBefore, error: beforeError }] = await Promise.all([
    database.from("job_sources").select("*").eq("enabled", true),
    database.from("discovery_jobs").select("id", { count: "exact", head: true }),
  ]);
  if (sourceError) throw sourceError;
  if (beforeError) throw beforeError;

  const preferredByCompany = new Map<string, any>();
  for (const source of initialSources || []) {
    const key = companyKey(source.company_name);
    const current = preferredByCompany.get(key);
    if (!current || (current.provider === "career_site" && source.provider !== "career_site")) preferredByCompany.set(key, source);
  }
  const targets: AuditTarget[] = TARGET_COMPANIES.map(company => ({
    company,
    source: preferredByCompany.get(companyKey(company)) || null,
    sourceOrigin: preferredByCompany.has(companyKey(company)) ? "existing" : null,
    discoveryMs: null,
    discoveryError: null,
    cold: null,
    warm: null,
  }));

  const missing = targets.filter(target => !target.source);
  console.log(JSON.stringify({ event: "audit_start", companies: targets.length, existing: targets.length - missing.length, discoveryRequired: missing.length, jobsBefore }));
  if (scanOnly) {
    missing.forEach(target => {
      target.discoveryError = "Source discovery failed during the preceding discovery pass";
      target.discoveryMs = 0;
    });
  } else await mapPool(missing, 4, async (target, index) => {
    const started = Date.now();
    try {
      const discovered = await discoverCompanySource(target.company);
      target.discoveryMs = Date.now() - started;
      const { data: stored, error } = await database.from("job_sources").upsert({
        provider: discovered.provider,
        external_key: discovered.externalKey,
        company_name: discovered.companyName,
        career_url: discovered.careerUrl,
        config: discovered.config,
        enabled: true,
        next_sync_at: new Date().toISOString(),
      }, { onConflict: "provider,external_key" }).select("*").single();
      if (error) throw error;
      target.source = stored;
      target.sourceOrigin = "discovered";
      if (!quiet) console.log(JSON.stringify({ event: "discovery", progress: `${index + 1}/${missing.length}`, company: target.company, status: "verified", provider: stored.provider, durationMs: target.discoveryMs }));
    } catch (error) {
      target.discoveryMs = Date.now() - started;
      target.discoveryError = error instanceof Error ? error.message : String(error);
      if (!quiet) console.log(JSON.stringify({ event: "discovery", progress: `${index + 1}/${missing.length}`, company: target.company, status: "failed", durationMs: target.discoveryMs, error: target.discoveryError }));
    }
  });

  const scannable = targets.filter(target => target.source);
  console.log(JSON.stringify({ event: "discovery_complete", scannable: scannable.length, failed: targets.length - scannable.length }));
  if (discoveryOnly) {
    console.log(JSON.stringify({
      event: "discovery_audit_complete",
      companiesTested: targets.length,
      sourcesVerified: scannable.length,
      failures: targets.filter(target => !target.source).map(target => ({
        company: target.company,
        durationMs: target.discoveryMs,
        error: target.discoveryError,
      })),
    }, null, 2));
    return;
  }
  const sourceIds = scannable.map(target => target.source.id);
  const { data: existingSubscriptions, error: subscriptionError } = await database.from("user_job_source_subscriptions")
    .select("source_id,enabled").eq("user_id", userId);
  if (subscriptionError) throw subscriptionError;
  const existingBySource = new Map((existingSubscriptions || []).map(row => [row.source_id, row.enabled === true]));
  const alreadySubscribed = new Set(Array.from(existingBySource).filter(([, enabled]) => enabled).map(([sourceId]) => sourceId));
  const temporarySourceIds = sourceIds.filter(id => !alreadySubscribed.has(id));
  const temporaryNewSourceIds = temporarySourceIds.filter(id => !existingBySource.has(id));
  const temporarilyReenabledSourceIds = temporarySourceIds.filter(id => existingBySource.has(id));
  if (temporarySourceIds.length) {
    const subscribedAt = new Date(Date.now() + 60 * 60_000).toISOString();
    for (let index = 0; index < temporarySourceIds.length; index += 25) {
      const { error } = await database.from("user_job_source_subscriptions").upsert(temporarySourceIds.slice(index, index + 25).map(sourceId => ({
        user_id: userId, source_id: sourceId, enabled: true, notify_email: false, min_fit_score: 100, subscribed_at: subscribedAt,
      })), { onConflict: "user_id,source_id" });
      if (error) throw error;
    }
  }
  console.log(JSON.stringify({ event: "scan_setup_complete", temporarySubscriptions: temporarySourceIds.length, existingSubscriptions: sourceIds.length - temporarySourceIds.length }));

  const runPhase = async (phase: "cold" | "warm") => {
    const phaseStarted = Date.now();
    await mapPool(scannable, 3, async (target, index) => {
      const result = await syncSource(target.source);
      target[phase] = result;
      if (!quiet) console.log(JSON.stringify({ event: "scan", phase, progress: `${index + 1}/${scannable.length}`, company: target.company, provider: target.source.provider, durationMs: result.durationMs, fetched: result.fetched, verified: result.verified, matched: result.matched, error: result.error || null }));
    });
    return Date.now() - phaseStarted;
  };

  let coldWallMs = 0;
  let warmWallMs = 0;
  try {
    coldWallMs = await runPhase("cold");
    warmWallMs = await runPhase("warm");
  } finally {
    if (temporarySourceIds.length) {
      if (temporaryNewSourceIds.length) await database.from("user_job_source_subscriptions").delete().eq("user_id", userId).in("source_id", temporaryNewSourceIds);
      if (temporarilyReenabledSourceIds.length) await database.from("user_job_source_subscriptions").update({ enabled: false }).eq("user_id", userId).in("source_id", temporarilyReenabledSourceIds);
      await database.from("user_job_recommendations").update({ active: false }).eq("user_id", userId).in("source_id", temporarySourceIds);
    }
  }

  const [
    { count: jobsAfter, error: afterError },
    { count: openJobs, error: openError },
    { count: jobsWithDescriptions, error: descriptionError },
  ] = await Promise.all([
    database.from("discovery_jobs").select("id", { count: "exact", head: true }),
    database.from("discovery_jobs").select("id", { count: "exact", head: true }).eq("status", "open"),
    database.from("discovery_jobs").select("id", { count: "exact", head: true }).not("description", "is", null).neq("description", ""),
  ]);
  if (afterError) throw afterError;
  if (openError) throw openError;
  if (descriptionError) throw descriptionError;

  const discoveryTimes = targets.map(target => target.discoveryMs).filter((value): value is number => value !== null);
  const coldTimes = scannable.map(target => target.cold?.durationMs).filter(Number.isFinite);
  const warmTimes = scannable.map(target => target.warm?.durationMs).filter(Number.isFinite);
  const failures = targets.flatMap(target => {
    if (target.discoveryError) return [{ company: target.company, stage: "discovery", provider: null, error: target.discoveryError }];
    if (target.cold?.error) return [{ company: target.company, stage: "cold_scan", provider: target.source?.provider, error: target.cold.error }];
    if (target.warm?.error) return [{ company: target.company, stage: "warm_scan", provider: target.source?.provider, error: target.warm.error }];
    if (!target.warm?.verified) return [{ company: target.company, stage: "content", provider: target.source?.provider, error: "Source returned no verified jobs" }];
    return [];
  });
  const byProvider = Object.entries(scannable.reduce((summary: Record<string, any>, target) => {
    const provider = target.source.provider;
    summary[provider] ||= { companies: 0, succeeded: 0, failed: 0, coldMs: [], warmMs: [], warmVerifiedJobs: 0 };
    summary[provider].companies += 1;
    const failed = Boolean(target.discoveryError || target.cold?.error || target.warm?.error || !target.warm?.verified);
    summary[provider][failed ? "failed" : "succeeded"] += 1;
    if (Number.isFinite(target.cold?.durationMs)) summary[provider].coldMs.push(target.cold.durationMs);
    if (Number.isFinite(target.warm?.durationMs)) summary[provider].warmMs.push(target.warm.durationMs);
    summary[provider].warmVerifiedJobs += target.warm?.verified || 0;
    return summary;
  }, {})).map(([provider, value]: [string, any]) => ({
    provider, companies: value.companies, succeeded: value.succeeded, failed: value.failed,
    medianColdMs: percentile(value.coldMs, 0.5), medianWarmMs: percentile(value.warmMs, 0.5), warmVerifiedJobs: value.warmVerifiedJobs,
  }));

  console.log(JSON.stringify({
    event: "audit_complete",
    companiesTested: targets.length,
    sourcesVerified: scannable.length,
    companiesPassed: targets.length - failures.length,
    companiesFailed: failures.length,
    jobsBefore,
    jobsAfter,
    jobsAdded: (jobsAfter || 0) - (jobsBefore || 0),
    databaseOpenJobs: openJobs || 0,
    databaseJobsWithDescriptions: jobsWithDescriptions || 0,
    coldWallMs,
    warmWallMs,
    speed: {
      discoveryMedianMs: percentile(discoveryTimes, 0.5), discoveryP90Ms: percentile(discoveryTimes, 0.9),
      coldMedianMs: percentile(coldTimes, 0.5), coldP90Ms: percentile(coldTimes, 0.9),
      warmMedianMs: percentile(warmTimes, 0.5), warmP90Ms: percentile(warmTimes, 0.9),
      medianWarmSpeedup: percentile(coldTimes, 0.5) && percentile(warmTimes, 0.5)
        ? Number((percentile(coldTimes, 0.5)! / percentile(warmTimes, 0.5)!).toFixed(2)) : null,
    },
    byProvider,
    failures,
  }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({ event: "audit_crashed", error: error instanceof Error ? error.stack || error.message : String(error) }));
  process.exitCode = 1;
});
