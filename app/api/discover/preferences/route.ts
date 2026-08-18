import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { supabaseAdmin } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";
const db = () => supabaseAdmin as any;
const ALLOWED_FREQUENCIES = new Set([15, 60, 360, 1440, 10080]);
const LOCATION_KEYS = ["preference_country", "preference_regions", "preference_remote", "preference_location_scope"];

function locationPreferences(rows: any[] = []) {
  const values = new Map(rows.map(row => [row.question_key, row.normalized_value]));
  return {
    preferred_country: values.get("preference_country") || "",
    preferred_regions: String(values.get("preference_regions") || "").split(",").filter(Boolean).map(value => decodeURIComponent(value)),
    // Existing users did not have a scope preference. Keep their discovery broad
    // rather than interpreting a resume address as a regional restriction.
    location_scope: ["regions", "country", "worldwide"].includes(String(values.get("preference_location_scope")))
      ? values.get("preference_location_scope")
      : "country",
    include_remote: values.get("preference_remote") !== "no",
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const [{ data, error }, { data: locations, error: locationError }] = await Promise.all([
      db().from("user_discovery_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      db().from("user_discovery_answers").select("question_key, normalized_value").eq("user_id", user.id).in("question_key", LOCATION_KEYS),
    ]);
    if (error && error.code !== "PGRST116") throw error;
    if (locationError) throw locationError;
    return NextResponse.json({ preferences: { ...(data || { email_enabled: false, digest_frequency_minutes: 1440, minimum_fit_score: 45 }), ...locationPreferences(locations) } });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load notification settings" }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json();
    const frequency = Number(body.digestFrequencyMinutes);
    const minimum = Math.max(0, Math.min(100, Number(body.minimumFitScore ?? 45)));
    if (!ALLOWED_FREQUENCIES.has(frequency) || !Number.isFinite(minimum)) return NextResponse.json({ error: "Invalid notification settings" }, { status: 400 });
    const emailEnabled = body.emailEnabled === true;
    const preferredCountry = String(body.preferredCountry || "").trim().toUpperCase();
    const preferredRegions = Array.isArray(body.preferredRegions) ? body.preferredRegions.map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 12) : [];
    const locationScope = ["regions", "country", "worldwide"].includes(body.locationScope) ? body.locationScope : "country";
    if (preferredCountry && !/^[A-Z]{2,3}$/.test(preferredCountry)) return NextResponse.json({ error: "Use a valid two- or three-letter country code" }, { status: 400 });
    const now = Date.now();
    const { data, error } = await db().from("user_discovery_preferences").upsert({
      user_id: user.id,
      email_enabled: emailEnabled,
      digest_frequency_minutes: frequency,
      minimum_fit_score: minimum,
      next_digest_at: new Date(now + frequency * 60_000).toISOString(),
    }, { onConflict: "user_id" }).select("*").single();
    if (error) throw error;
    const { error: subscriptionError } = await db().from("user_job_source_subscriptions").update({
      notify_email: emailEnabled,
      min_fit_score: minimum,
    }).eq("user_id", user.id).eq("enabled", true);
    if (subscriptionError) throw subscriptionError;
    const locationRows = [
      preferredCountry && { user_id: user.id, question_key: "preference_country", category: "location", question: "Which country should Discovery prioritize?", answer: preferredCountry, normalized_value: preferredCountry, reuse_approved: true, source_job_id: null, provided_at: new Date().toISOString() },
      { user_id: user.id, question_key: "preference_regions", category: "location", question: "Which regions should Discovery prioritize?", answer: preferredRegions.join(", ") || "Any region", normalized_value: preferredRegions.map((region: string) => encodeURIComponent(region)).join(","), reuse_approved: true, source_job_id: null, provided_at: new Date().toISOString() },
      { user_id: user.id, question_key: "preference_location_scope", category: "location", question: "How broadly should Discovery search?", answer: locationScope === "regions" ? "Preferred regions only" : locationScope === "worldwide" ? "Worldwide" : "Anywhere in my country", normalized_value: locationScope, reuse_approved: true, source_job_id: null, provided_at: new Date().toISOString() },
      { user_id: user.id, question_key: "preference_remote", category: "location", question: "Include remote roles?", answer: body.includeRemote === false ? "No" : "Yes", normalized_value: body.includeRemote === false ? "no" : "yes", reuse_approved: true, source_job_id: null, provided_at: new Date().toISOString() },
    ].filter(Boolean);
    if (locationRows.length) {
      const { error: locationSaveError } = await db().from("user_discovery_answers").upsert(locationRows, { onConflict: "user_id,question_key" });
      if (locationSaveError) throw locationSaveError;
    }
    if (!preferredCountry) {
      const { error: clearCountryError } = await db().from("user_discovery_answers").delete().eq("user_id", user.id).eq("question_key", "preference_country");
      if (clearCountryError) throw clearCountryError;
    }
    return NextResponse.json({ preferences: { ...data, ...locationPreferences(locationRows) } });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save notification settings" }, { status });
  }
}
