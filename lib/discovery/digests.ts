import { supabaseAdmin } from "@/lib/supabase/client";
import { sendDiscoveryEmail } from "./email";

const db = () => supabaseAdmin as any;

export async function sendDueDiscoveryDigests(limit = 50) {
  const now = new Date();
  const { data: preferences, error } = await db().from("user_discovery_preferences")
    .select("user_id, digest_frequency_minutes, minimum_fit_score, profiles(email, email_notifications)")
    .eq("email_enabled", true).lte("next_digest_at", now.toISOString()).limit(limit);
  if (error && (error.code === "42P01" || error.code === "PGRST205")) return [];
  if (error) throw error;
  const results = [];
  for (const preference of preferences || []) {
    const profile = Array.isArray(preference.profiles) ? preference.profiles[0] : preference.profiles;
    const nextDigestAt = new Date(Date.now() + preference.digest_frequency_minutes * 60_000).toISOString();
    if (!profile?.email || profile.email_notifications === false) {
      await db().from("user_discovery_preferences").update({ last_digest_at: now.toISOString(), next_digest_at: nextDigestAt }).eq("user_id", preference.user_id);
      continue;
    }
    const { data: notifications, error: notificationError } = await db().from("discovery_notifications")
      .select("id, job_ids").eq("user_id", preference.user_id).is("emailed_at", null).order("created_at", { ascending: true }).limit(50);
    if (notificationError) throw notificationError;
    const notificationIds = (notifications || []).map((item: any) => item.id);
    const jobIds = Array.from(new Set((notifications || []).flatMap((item: any) => item.job_ids || [])));
    if (!jobIds.length) {
      await db().from("user_discovery_preferences").update({ last_digest_at: now.toISOString(), next_digest_at: nextDigestAt }).eq("user_id", preference.user_id);
      continue;
    }
    const { data: recommendations, error: recommendationError } = await db().from("user_job_recommendations")
      .select("fit_score, discovery_jobs(id, title, company_name, location, source_published_at)")
      .eq("user_id", preference.user_id).eq("active", true).gte("fit_score", preference.minimum_fit_score).in("discovery_job_id", jobIds);
    if (recommendationError) throw recommendationError;
    const jobs = (recommendations || []).map((item: any) => Array.isArray(item.discovery_jobs) ? item.discovery_jobs[0] : item.discovery_jobs).filter(Boolean)
      .sort((a: any, b: any) => new Date(b.source_published_at || 0).getTime() - new Date(a.source_published_at || 0).getTime()).slice(0, 10);
    try {
      if (jobs.length) await sendDiscoveryEmail({ to: profile.email, jobs, deliveryKey: `digest-${preference.user_id}-${notificationIds.join("-")}` });
      if (notificationIds.length) await db().from("discovery_notifications").update({ emailed_at: now.toISOString(), email_error: null }).in("id", notificationIds);
      results.push({ userId: preference.user_id, sent: jobs.length });
    } catch (sendError) {
      if (notificationIds.length) await db().from("discovery_notifications").update({ email_error: sendError instanceof Error ? sendError.message : "Email failed" }).in("id", notificationIds);
      results.push({ userId: preference.user_id, sent: 0, error: true });
    }
    await db().from("user_discovery_preferences").update({ last_digest_at: now.toISOString(), next_digest_at: nextDigestAt }).eq("user_id", preference.user_id);
  }
  return results;
}
