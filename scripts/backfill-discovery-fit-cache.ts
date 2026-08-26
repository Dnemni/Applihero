import { config } from "dotenv";

config({ path: ".env.local" });

async function mapPool<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) await work(items[cursor++]);
  }));
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { getUserBackground } = await import("../lib/discovery/repository");
  const { buildQuickFit, MATCHER_VERSION } = await import("../lib/discovery/matcher");
  const { applyDiscoveryEligibilityGate } = await import("../lib/discovery/matcher");
  const { assessDiscoveryEligibility, getDiscoveryApplicantProfile } = await import("../lib/discovery/eligibility");
  const { hashText } = await import("../lib/discovery/parser");
  const database = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const requestedUser = process.argv.find(value => value.startsWith("--user="))?.slice("--user=".length);

  const data: any[] = [];
  const pageSize = 250;
  const jobFields = [
    "id", "source_id", "source_job_id", "company_name", "title", "location", "workplace_type", "employment_type", "departments",
    "source_url", "apply_url", "source_published_at", "source_updated_at", "application_deadline", "discovered_at", "last_verified_at", "status",
    "parsed_requirements", "parser_version", "content_hash",
  ].join(",");
  while (true) {
    let query = database.from("user_job_recommendations")
      .select(`user_id,discovery_job_id,active,quick_fit,discovery_jobs(${jobFields})`)
      .order("discovery_job_id")
      .range(data.length, data.length + pageSize - 1);
    if (requestedUser) query = query.eq("user_id", requestedUser);
    const { data: page, error } = await query;
    if (error) throw error;
    data.push(...(page || []));
    if (!page || page.length < pageSize) break;
  }

  const rows = data.flatMap((row: any) => {
    const job = Array.isArray(row.discovery_jobs) ? row.discovery_jobs[0] : row.discovery_jobs;
    return job && job.status !== "closed" ? [{ ...row, job }] : [];
  });
  const userIds = Array.from(new Set(rows.map(row => String(row.user_id))));
  const contextByUser = new Map<string, { background: string; profileHash: string; profile: ReturnType<typeof getDiscoveryApplicantProfile> }>();
  for (const userId of userIds) {
    const background = await getUserBackground(userId);
    contextByUser.set(userId, { background, profileHash: hashText(background), profile: getDiscoveryApplicantProfile(background) });
  }

  let updated = 0;
  let unchanged = 0;
  const started = Date.now();
  await mapPool(rows, 12, async row => {
    const context = contextByUser.get(row.user_id)!;
    const current = row.quick_fit || {};
    if (
      current.matcherVersion === MATCHER_VERSION &&
      current.evaluatedProfileHash === context.profileHash &&
      current.evaluatedJobHash === row.job.content_hash &&
      typeof current.discoveryEligible === "boolean" &&
      row.active === true
    ) {
      unchanged += 1;
      return;
    }
    const quickFit = applyDiscoveryEligibilityGate({
      ...buildQuickFit(row.job, context.background),
      matcherVersion: MATCHER_VERSION,
      evaluatedProfileHash: context.profileHash,
      evaluatedJobHash: row.job.content_hash,
    }, assessDiscoveryEligibility(row.job, context.profile));
    const { error: updateError } = await database.from("user_job_recommendations").update({
      active: true,
      fit_score: quickFit.score,
      fit_band: quickFit.band,
      eligibility_status: quickFit.eligibility.status,
      quick_fit: quickFit,
      last_evaluated_at: new Date().toISOString(),
    }).eq("user_id", row.user_id).eq("discovery_job_id", row.discovery_job_id);
    if (updateError) throw updateError;
    updated += 1;
  });

  console.log(JSON.stringify({ users: userIds.length, recommendations: rows.length, updated, unchanged, durationMs: Date.now() - started }));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
