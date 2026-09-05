import { config } from "dotenv";
import { performance } from "node:perf_hooks";

config({ path: ".env.local" });

/**
 * Measures every Supabase query the Discover read path issues for one user.
 * Prints duration, row count, and serialized payload size per query so the
 * feed can be profiled with production-like data. Read-only.
 *
 * Usage: npx tsx scripts/diagnose-discovery-read-path.ts [--email you@example.com | --user <uuid>]
 */
type Timing = { label: string; ms: number; rows: number; bytes: number; note?: string };
const timings: Timing[] = [];

async function timed<T>(label: string, run: () => PromiseLike<{ data: T; error: any; count?: number | null }>, note?: string): Promise<{ data: T; count: number | null }> {
  const started = performance.now();
  const result = await run();
  const ms = performance.now() - started;
  if (result.error) {
    timings.push({ label, ms, rows: 0, bytes: 0, note: `ERROR: ${result.error.message || JSON.stringify(result.error)}` });
    return { data: ([] as unknown) as T, count: null };
  }
  const rows = Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0;
  const bytes = Buffer.byteLength(JSON.stringify(result.data ?? null));
  timings.push({ label, ms, rows, bytes, note });
  return { data: result.data, count: result.count ?? null };
}

function fmt(n: number) { return n.toLocaleString("en-US", { maximumFractionDigits: 0 }); }

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
  const emailArg = process.argv.indexOf("--email");
  const userArg = process.argv.indexOf("--user");
  let userId = userArg >= 0 ? process.argv[userArg + 1] : process.env.TEST_USER_ID || "";
  if (emailArg >= 0) {
    const { data, error } = await db.from("profiles").select("id,email").ilike("email", process.argv[emailArg + 1]).limit(1);
    if (error) throw error;
    if (!data?.length) throw new Error("No profile for that email");
    userId = data[0].id;
  }
  if (!userId) throw new Error("Provide --email or --user");
  console.log(`User: ${userId}\n`);

  // --- Catalog-wide facts ---------------------------------------------------
  const statusCounts: Record<string, number> = {};
  for (const status of ["open", "unverified", "closed"]) {
    const { count } = await timed(`count discovery_jobs status=${status}`, () => db.from("discovery_jobs").select("id", { count: "exact", head: true }).eq("status", status));
    statusCounts[status] = count || 0;
  }
  const { count: openNullPublished } = await timed("count open jobs with null source_published_at", () => db.from("discovery_jobs").select("id", { count: "exact", head: true }).eq("status", "open").is("source_published_at", null));
  const cutoff30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { count: open30 } = await timed("count open jobs published in last 30 days", () => db.from("discovery_jobs").select("id", { count: "exact", head: true }).eq("status", "open").gte("source_published_at", cutoff30));
  const { count: openNoDescription } = await timed("count open jobs with empty description", () => db.from("discovery_jobs").select("id", { count: "exact", head: true }).eq("status", "open").or("description.is.null,description.eq."));
  const { count: sourceCount } = await timed("count enabled job_sources", () => db.from("job_sources").select("id", { count: "exact", head: true }).eq("enabled", true));
  const { data: sourceJobCounts } = await timed("open jobs per source (sample)", () => db.from("discovery_jobs").select("source_id").eq("status", "open").limit(20000));
  const perSource = new Map<string, number>();
  for (const row of sourceJobCounts as any[]) perSource.set(row.source_id, (perSource.get(row.source_id) || 0) + 1);

  // --- The route's fan-out ------------------------------------------------
  const { data: profileRow } = await timed("hasUserBackground (profiles)", () => db.from("profiles").select("id").eq("id", userId).or("resume_text.not.is.null,transcript_text.not.is.null,bio.not.is.null").limit(1));
  await timed("hasUserSubscriptions", () => db.from("user_job_source_subscriptions").select("id").eq("user_id", userId).eq("enabled", true).limit(1));
  const { data: background } = await timed("getUserBackground: profiles text", () => db.from("profiles").select("resume_text, transcript_text, bio").eq("id", userId).maybeSingle());
  await timed("getUserBackground: reuse-approved answers", () => db.from("user_discovery_answers").select("*").eq("user_id", userId).eq("reuse_approved", true).order("provided_at", { ascending: false }));
  const { data: sourceIdRows } = await timed("getUserSourceIds", () => db.from("user_job_source_subscriptions").select("source_id").eq("user_id", userId).eq("enabled", true));
  const sourceIds = (sourceIdRows as any[]).map(r => r.source_id);
  const { data: locationRows } = await timed("location preference rows", () => db.from("user_discovery_answers").select("question_key, normalized_value").eq("user_id", userId).in("question_key", ["preference_country", "preference_regions", "preference_remote", "preference_location_scope"]));

  // --- Matches: replicate getUserRecommendedJobPage -----------------------
  const recRows: any[] = [];
  let page = 0;
  while (true) {
    const { data } = await timed(`matches: recommendation page ${page}`, () => db.from("user_job_recommendations")
      .select("discovery_job_id,fit_score,fit_band,eligibility_status,source_id,active,last_evaluated_at,evaluated_job_hash:quick_fit->>evaluatedJobHash,evaluated_profile_hash:quick_fit->>evaluatedProfileHash")
      .eq("user_id", userId).eq("active", true).in("source_id", sourceIds)
      .gte("fit_score", 50).neq("fit_band", "likely_conflict").neq("eligibility_status", "conflict")
      .order("discovery_job_id").range(recRows.length, recRows.length + 999));
    recRows.push(...(data as any[]));
    page += 1;
    if ((data as any[]).length < 1000) break;
  }
  const jobIds = recRows.map(r => r.discovery_job_id);
  const chunks = Array.from({ length: Math.ceil(jobIds.length / 100) }, (_, i) => jobIds.slice(i * 100, i * 100 + 100));
  const metadata: any[] = [];
  const chunkStart = performance.now();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(6, chunks.length) }, async () => {
    while (cursor < chunks.length) {
      const ids = chunks[cursor++];
      const { data } = await timed(`matches: metadata chunk (${ids.length} ids)`, () => db.from("discovery_jobs")
        .select("id,source_published_at,discovered_at,status,title,company_name,location,workplace_type")
        .in("id", ids).eq("status", "open").gte("source_published_at", cutoff30));
      metadata.push(...(data as any[]));
    }
  }));
  const chunkWall = performance.now() - chunkStart;
  metadata.sort((a, b) => new Date(b.source_published_at || b.discovered_at).getTime() - new Date(a.source_published_at || a.discovered_at).getTime());
  const selected = metadata.slice(0, 150).map(j => j.id);
  if (selected.length) {
    const jobFields = "id,source_id,source_job_id,company_name,title,location,workplace_type,employment_type,departments,source_url,apply_url,source_published_at,source_published_precision,source_published_source,source_updated_at,application_deadline,discovered_at,first_seen_at,last_seen_at,last_verified_at,status,parsed_requirements,parser_version,content_hash,job_sources(provider,company_name,external_key)";
    await Promise.all([
      timed(`matches: full job rows for ${selected.length} selected`, () => db.from("discovery_jobs").select(jobFields).in("id", selected)),
      timed(`matches: quick_fit rows for ${selected.length} selected`, () => db.from("user_job_recommendations").select("discovery_job_id,quick_fit").eq("user_id", userId).in("discovery_job_id", selected)),
    ]);
    await timed("getUserApplicationStates", () => db.from("jobs").select("id,discovery_job_id,status,last_touched_at").eq("user_id", userId).in("discovery_job_id", selected.slice(0, 50)));
  }

  // --- Recommendation health for this user --------------------------------
  const allRecs: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await timed(`all recommendations page ${from / 1000}`, () => db.from("user_job_recommendations")
      .select("discovery_job_id,source_id,fit_score,fit_band,eligibility_status,active,last_evaluated_at,matcher_version:quick_fit->>matcherVersion,evaluated_profile_hash:quick_fit->>evaluatedProfileHash,evaluated_job_hash:quick_fit->>evaluatedJobHash,discovery_eligible:quick_fit->>discoveryEligible")
      .eq("user_id", userId).range(from, from + 999));
    allRecs.push(...(data as any[]));
    if ((data as any[]).length < 1000) break;
  }
  const followed = new Set(sourceIds);
  const summarize = (rows: any[]) => ({
    total: rows.length,
    active: rows.filter(r => r.active).length,
    followedSource: rows.filter(r => followed.has(r.source_id)).length,
    scoreGte50: rows.filter(r => r.fit_score !== null && r.fit_score >= 50).length,
    scoreGt50: rows.filter(r => r.fit_score !== null && r.fit_score > 50).length,
    scoreEq50: rows.filter(r => r.fit_score === 50).length,
    nullScore: rows.filter(r => r.fit_score === null).length,
    likelyConflict: rows.filter(r => r.fit_band === "likely_conflict").length,
    eligibilityConflict: rows.filter(r => r.eligibility_status === "conflict").length,
    bands: rows.reduce((acc: Record<string, number>, r) => { acc[r.fit_band] = (acc[r.fit_band] || 0) + 1; return acc; }, {}),
    matcherVersions: rows.reduce((acc: Record<string, number>, r) => { const v = String(r.matcher_version ?? "null"); acc[v] = (acc[v] || 0) + 1; return acc; }, {}),
    discoveryEligibleMissing: rows.filter(r => r.discovery_eligible !== "true" && r.discovery_eligible !== "false").length,
  });
  const { hashText } = await import("../lib/discovery/parser");
  const { answersToMatchingContext } = await import("../lib/discovery/facts");
  const { MATCHER_VERSION } = await import("../lib/discovery/matcher");
  const { data: answers } = await db.from("user_discovery_answers").select("*").eq("user_id", userId).eq("reuse_approved", true).order("provided_at", { ascending: false });
  const bg = [ (background as any)?.resume_text, (background as any)?.transcript_text, (background as any)?.bio, answersToMatchingContext(answers || []) ].filter(Boolean).join("\n\n");
  const profileHash = hashText(bg);
  const staleProfile = allRecs.filter(r => r.active && r.evaluated_profile_hash !== profileHash).length;
  const staleVersion = allRecs.filter(r => r.active && r.matcher_version !== MATCHER_VERSION).length;
  // Job hash staleness: compare against current content_hash for the active qualifying set.
  const { data: hashRows } = await timed("content_hash for qualifying jobs", () => db.from("discovery_jobs").select("id,content_hash,status,source_published_at,location,workplace_type").in("id", jobIds.slice(0, 1000)));
  const hashById = new Map((hashRows as any[]).map(r => [r.id, r]));
  const staleJob = recRows.filter(r => { const j = hashById.get(r.discovery_job_id); return j && j.content_hash !== r.evaluated_job_hash; }).length;

  // Location filter effect on the qualifying set
  const { matchesDiscoveryLocation } = await import("../lib/discovery/location");
  const values = new Map((locationRows as any[]).map(r => [r.question_key, r.normalized_value]));
  const scope = String(values.get("preference_location_scope") || "country");
  const prefs = {
    preferredCountry: String(values.get("preference_country") || ""),
    preferredRegions: String(values.get("preference_regions") || "").split(",").filter(Boolean).map(decodeURIComponent),
    locationScope: (scope === "regions" || scope === "worldwide" ? scope : "country") as any,
    includeRemote: values.get("preference_remote") !== "no",
  };
  const qualifyingJobs = recRows.map(r => hashById.get(r.discovery_job_id)).filter(Boolean) as any[];
  const openQualifying = qualifyingJobs.filter(j => j.status === "open");
  const fresh30 = openQualifying.filter(j => j.source_published_at && j.source_published_at >= cutoff30);
  const locationPass = fresh30.filter(j => matchesDiscoveryLocation(j, prefs));
  const locationPassNoFreshness = openQualifying.filter(j => matchesDiscoveryLocation(j, prefs));

  // --- All roles: replicate getCatalogDiscoveryJobs -----------------------
  await timed("all roles: select * + exact count, limit 50", () => db.from("discovery_jobs").select("*, job_sources(provider, company_name, external_key)", { count: "exact" }).eq("status", "open").order("source_published_at", { ascending: false, nullsFirst: false }).order("discovered_at", { ascending: false }).limit(50));
  const listFields = "id,source_id,source_job_id,company_name,title,location,workplace_type,employment_type,source_url,apply_url,source_published_at,source_published_precision,discovered_at,first_seen_at,status,job_sources(provider,company_name,external_key)";
  await timed("all roles: narrow projection, no count, limit 50", () => db.from("discovery_jobs").select(listFields).eq("status", "open").order("source_published_at", { ascending: false, nullsFirst: false }).order("discovered_at", { ascending: false }).limit(50));
  await timed("all roles: narrow projection + exact count, limit 50", () => db.from("discovery_jobs").select(listFields, { count: "exact" }).eq("status", "open").order("source_published_at", { ascending: false, nullsFirst: false }).order("discovered_at", { ascending: false }).limit(50));
  await timed("all roles: narrow projection + estimated count, limit 50", () => db.from("discovery_jobs").select(listFields, { count: "estimated" }).eq("status", "open").order("source_published_at", { ascending: false, nullsFirst: false }).order("discovered_at", { ascending: false }).limit(50));
  await timed("all roles: description ilike search 'engineer'", () => db.from("discovery_jobs").select(listFields).eq("status", "open").or("title.ilike.%engineer%,company_name.ilike.%engineer%,description.ilike.%engineer%").order("source_published_at", { ascending: false, nullsFirst: false }).limit(50));
  await timed("all roles: title/company ilike search 'engineer'", () => db.from("discovery_jobs").select(listFields).eq("status", "open").or("title.ilike.%engineer%,company_name.ilike.%engineer%").order("source_published_at", { ascending: false, nullsFirst: false }).limit(50));
  const { data: first50 } = await timed("all roles: first 50 (for location analysis)", () => db.from("discovery_jobs").select("id,location,workplace_type,source_published_at").eq("status", "open").order("source_published_at", { ascending: false, nullsFirst: false }).order("discovered_at", { ascending: false }).limit(50));
  const first50Pass = (first50 as any[]).filter(j => matchesDiscoveryLocation(j, prefs)).length;
  const { data: openSample } = await timed("all roles: open location sample 5000", () => db.from("discovery_jobs").select("id,location,workplace_type,source_published_at").eq("status", "open").order("source_published_at", { ascending: false, nullsFirst: false }).limit(5000));
  const openSamplePass = (openSample as any[]).filter(j => matchesDiscoveryLocation(j, prefs)).length;
  const unknownLocations = (openSample as any[]).filter(j => !String(j.location || "").trim()).length;

  // --- Companion: sources route -------------------------------------------
  await timed("sources: enabled job_sources", () => db.from("job_sources").select("id, provider, external_key, company_name, career_url, enabled, featured, last_sync_completed_at, last_successful_scan_at, next_sync_at, last_sync_error, sync_interval_minutes").eq("enabled", true).order("featured", { ascending: false }).order("company_name"));
  await timed("sources: recommendation candidates (120, parsed_requirements)", () => db.from("discovery_jobs").select("id, source_id, source_job_id, company_name, title, location, workplace_type, employment_type, source_published_at, parsed_requirements, parser_version, content_hash").neq("status", "closed").order("source_published_at", { ascending: false, nullsFirst: false }).limit(120));
  await timed("sources: active ingestion tasks for followed", () => db.from("discovery_ingestion_tasks").select("source_id,status,scheduled_for,available_at,lease_expires_at,last_error").in("source_id", sourceIds).in("status", ["queued", "running", "retry_wait", "failed"]).order("scheduled_for", { ascending: false }));
  await timed("notifications", () => db.from("discovery_notifications").select("id, kind, title, body, job_ids, read_at, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20));

  // --- Report ---------------------------------------------------------------
  console.log("== Query timings ==");
  console.log(["ms".padStart(7), "rows".padStart(6), "bytes".padStart(10), " label"].join(" "));
  for (const t of timings) console.log([fmt(t.ms).padStart(7), fmt(t.rows).padStart(6), fmt(t.bytes).padStart(10), " " + t.label + (t.note ? `  <-- ${t.note}` : "")].join(" "));
  console.log(`\nTotal measured DB time (sequential sum): ${fmt(timings.reduce((s, t) => s + t.ms, 0))} ms`);
  console.log(`Metadata chunk fan-out wall time: ${fmt(chunkWall)} ms across ${chunks.length} chunks`);

  console.log("\n== Catalog ==");
  console.log({ statusCounts, openNullPublished, openLast30Days: open30, openNoDescription, enabledSources: sourceCount, sourcesWithOpenJobs: perSource.size });
  console.log("first 50 catalog rows passing saved location filter:", first50Pass, "/", (first50 as any[]).length);
  console.log("newest 5000 open rows passing saved location filter:", openSamplePass, "/", (openSample as any[]).length, "| blank locations:", unknownLocations);

  console.log("\n== User ==");
  console.log({ hasBackground: Boolean((profileRow as any[])?.length), followedSources: sourceIds.length, backgroundChars: bg.length, profileHash, matcherVersion: MATCHER_VERSION, locationPrefs: prefs });
  console.log("all recommendations:", summarize(allRecs));
  console.log("active recommendations from followed sources:", summarize(allRecs.filter(r => r.active && followed.has(r.source_id))));
  console.log({ staleProfileHash_active: staleProfile, staleMatcherVersion_active: staleVersion, staleJobHash_inQualifying: staleJob });
  console.log("\n== Matches funnel (route logic) ==");
  console.log({
    qualifyingRecommendationRows: recRows.length,
    withOpenJob: openQualifying.length,
    publishedWithin30Days: fresh30.length,
    afterLocationFilter: locationPass.length,
    afterLocationFilter_noFreshness: locationPassNoFreshness.length,
    nullPublishedAmongOpenQualifying: openQualifying.filter(j => !j.source_published_at).length,
  });
  const followedSourcesWithRecs = new Set(allRecs.filter(r => followed.has(r.source_id)).map(r => r.source_id));
  console.log("followed sources with any recommendation rows:", followedSourcesWithRecs.size, "/", sourceIds.length);
  const followedOpenJobs = Array.from(perSource.entries()).filter(([id]) => followed.has(id)).reduce((s, [, n]) => s + n, 0);
  console.log("open catalog jobs across followed sources:", followedOpenJobs);
}

main().catch(error => { console.error(error); process.exit(1); });
