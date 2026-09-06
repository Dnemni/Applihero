import { supabaseAdmin } from "@/lib/supabase/client";
import { sendDiscoveryEmail } from "./email";
import { decodeLocationPreferences } from "./location";
import { eligibleDigestJobs, selectDigestNotifications } from "./digest-policy";
import { createHash } from "node:crypto";

const checked = (result: any) => { if (result.error) throw result.error; return result.data; };

export async function sendDueDiscoveryDigests(limit = 50) {
  const database = supabaseAdmin as any;
  const started = Date.now();
  const results = [];
  // Claim one user at a time so a slow provider cannot strand unvisited leases.
  for (let index = 0; index < Math.max(1, Math.min(limit, 100)) && Date.now() - started < 45_000; index++) {
    const lockToken = crypto.randomUUID();
    const claim = await database.rpc("claim_discovery_digest_preferences", { p_limit: 1, p_lock_token: lockToken });
    if (claim.error && ["42P01", "PGRST202", "PGRST205"].includes(claim.error.code)) return results;
    const preference = checked(claim)?.[0];
    if (!preference) break;
    let notificationIds: string[] = [];
    let next = new Date(Date.now() + preference.digest_frequency_minutes * 60_000).toISOString();
    let failed = false;
    try {
      const profile = checked(await database.from("profiles").select("email,email_notifications").eq("id", preference.user_id).maybeSingle());
      if (!profile?.email || profile.email_notifications === false) continue;
      const notifications = checked(await database.from("discovery_notifications").select("id,job_ids")
        .eq("user_id", preference.user_id).eq("kind", "job_matches").is("emailed_at", null)
        .order("created_at", { ascending: true }).order("id").limit(50)) || [];
      const batch = selectDigestNotifications(notifications);
      notificationIds = batch.notifications.map(row => row.id);
      if (!notificationIds.length) continue;
      const [recommendations, subscriptions, answers] = await Promise.all([
        batch.jobIds.length ? database.from("user_job_recommendations")
          .select("source_id,fit_score,fit_band,eligibility_status,discovery_eligible:quick_fit->>discoveryEligible,discovery_jobs(id,title,company_name,location,workplace_type,status,source_published_at)")
          .eq("user_id", preference.user_id).eq("active", true).in("discovery_job_id", batch.jobIds) : { data: [], error: null },
        database.from("user_job_source_subscriptions").select("source_id,min_fit_score")
          .eq("user_id", preference.user_id).eq("enabled", true).eq("notify_email", true),
        database.from("user_discovery_answers").select("question_key,normalized_value").eq("user_id", preference.user_id)
          .in("question_key", ["preference_country", "preference_regions", "preference_remote", "preference_location_scope"]),
      ]);
      const jobs = eligibleDigestJobs(checked(recommendations) || [], checked(subscriptions) || [], preference.minimum_fit_score,
        decodeLocationPreferences(checked(answers) || []));
      // Hash the complete batch identity instead of truncating a list of UUIDs.
      const deliveryKey = createHash("sha256").update(preference.user_id + ":" + [...notificationIds].sort().join(",")).digest("hex");
      if (jobs.length) await sendDiscoveryEmail({ to: profile.email, jobs, deliveryKey });
      checked(await database.from("discovery_notifications").update({ emailed_at: new Date().toISOString(), email_error: null })
        .eq("user_id", preference.user_id).in("id", notificationIds));
      if (batch.hasMore || notifications.length === 50) next = new Date(Date.now() + 5 * 60_000).toISOString();
      results.push({ userId: preference.user_id, sent: jobs.length });
    } catch (error) {
      failed = true;
      next = new Date(Date.now() + 15 * 60_000).toISOString();
      const message = error instanceof Error ? error.message : String((error as any)?.message || "Digest failed");
      if (notificationIds.length) {
        const recorded = await database.from("discovery_notifications").update({ email_error: message }).eq("user_id", preference.user_id).in("id", notificationIds);
        if (recorded.error) console.error("Digest failure could not be recorded", recorded.error);
      }
      results.push({ userId: preference.user_id, sent: 0, error: true });
    } finally {
      const released = await database.from("user_discovery_preferences").update({
        ...(!failed ? { last_digest_at: new Date().toISOString() } : {}), next_digest_at: next,
        digest_lock_token: null, digest_locked_until: null,
      }).eq("user_id", preference.user_id).eq("digest_lock_token", lockToken);
      if (released.error) {
        console.error("Digest lease acknowledgement failed", released.error);
        results.push({ userId: preference.user_id, sent: 0, error: true });
      }
    }
  }
  return results;
}
