import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { discoverCompanySource, sourceFromCareerUrl, verifySourceConfig } from "@/lib/discovery/connectors";
import { supabaseAdmin } from "@/lib/supabase/client";
import { buildQuickFit } from "@/lib/discovery/matcher";
import { getDiscoverySourceRecommendationCandidates, getUserBackground } from "@/lib/discovery/repository";
import { assessDiscoveryEligibility, getDiscoveryApplicantProfile } from "@/lib/discovery/eligibility";

export const dynamic = "force-dynamic";
const db = () => supabaseAdmin as any;

function sourceErrorMessage(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value === "[object Object]" ? "Previous scan failed" : value;
  if (typeof value === "object" && "message" in value) return String((value as { message: unknown }).message);
  return "Previous scan failed";
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const [{ data: sources, error: sourceError }, { data: subscriptions, error: subscriptionError }, background, openJobs] = await Promise.all([
      db().from("job_sources").select("id, provider, external_key, company_name, career_url, enabled, featured, last_sync_completed_at, last_sync_error, sync_interval_minutes").eq("enabled", true).order("featured", { ascending: false }).order("company_name"),
      db().from("user_job_source_subscriptions").select("source_id, notify_email, min_fit_score").eq("user_id", user.id).eq("enabled", true),
      getUserBackground(user.id),
      getDiscoverySourceRecommendationCandidates(120),
    ]);
    if (sourceError) throw sourceError;
    if (subscriptionError) throw subscriptionError;
    const followed = new Map((subscriptions || []).map((item: any) => [item.source_id, item]));
    const visibleSources = (sources || []).map((source: any) => ({
      ...source,
      last_sync_error: sourceErrorMessage(source.last_sync_error),
      subscribed: followed.has(source.id),
      subscription: followed.get(source.id) || null,
    }));
    const scoresBySource = new Map<string, number>();
    const applicantProfile = getDiscoveryApplicantProfile(background);
    for (const job of openJobs) {
      if (followed.has(job.source_id)) continue;
      if (!assessDiscoveryEligibility(job as any, applicantProfile).eligible) continue;
      const fit = buildQuickFit(job, background);
      if (fit.score === null || fit.eligibility.status === "conflict" || fit.band === "likely_conflict") continue;
      scoresBySource.set(job.source_id, Math.max(scoresBySource.get(job.source_id) ?? -1, fit.score));
    }
    const studentFriendly = new Set(["Roblox", "Anduril", "SpaceX", "Databricks", "Figma", "Reddit", "Cloudflare", "Dropbox", "Scale AI", "Waymo"]);
    const recommendations = visibleSources
      .filter((source: any) => !source.subscribed)
      .map((source: any) => ({
        sourceId: source.id,
        companyName: source.company_name,
        bestScore: scoresBySource.get(source.id) ?? null,
        reason: scoresBySource.has(source.id)
          ? `A current role has a preliminary ${scoresBySource.get(source.id)}/100 fit based on your latest profile.`
          : "A verified employer to consider for your student-focused watch list.",
        fallbackRank: studentFriendly.has(source.company_name) ? 1 : 0,
      }))
      .filter((item: any) => item.bestScore !== null || item.fallbackRank)
      .sort((a: any, b: any) => (b.bestScore ?? -1) - (a.bestScore ?? -1) || b.fallbackRank - a.fallbackRank || a.companyName.localeCompare(b.companyName))
      .slice(0, 6)
      .map(({ fallbackRank: _rank, ...item }: any) => item);
    return NextResponse.json({ sources: visibleSources, recommendations });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load companies" }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json();
    if (body.preview) {
      const companyName = String(body.companyName || "").trim();
      if (!companyName) return NextResponse.json({ error: "Enter a company name" }, { status: 400 });
      const { data: existing, error: existingError } = await db().from("job_sources")
        .select("id, provider, external_key, company_name, career_url")
        .ilike("company_name", companyName)
        .eq("enabled", true)
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing?.career_url) return NextResponse.json({ suggestion: {
        companyName: existing.company_name, provider: existing.provider, externalKey: existing.external_key,
        careerUrl: existing.career_url, existingSourceId: existing.id,
      } });
      const suppliedCareerUrl = String(body.careerUrl || "").trim();
      const source = suppliedCareerUrl
        ? await verifySourceConfig(sourceFromCareerUrl(companyName, suppliedCareerUrl))
        : await discoverCompanySource(companyName);
      return NextResponse.json({ suggestion: {
        companyName: source.companyName, provider: source.provider, externalKey: source.externalKey, careerUrl: source.careerUrl,
      } });
    }
    let sourceId = String(body.sourceId || "");
    if (!sourceId) {
      const source = sourceFromCareerUrl(String(body.companyName || ""), String(body.careerUrl || ""));
      const { data, error } = await db().from("job_sources").upsert({
        provider: source.provider, external_key: source.externalKey, company_name: source.companyName,
        career_url: source.careerUrl, config: source.config, enabled: true, next_sync_at: new Date().toISOString(),
      }, { onConflict: "provider,external_key" }).select("id").single();
      if (error) throw error;
      sourceId = data.id;
    }
    const { data: preferences, error: preferenceError } = await db().from("user_discovery_preferences")
      .select("email_enabled, minimum_fit_score").eq("user_id", user.id).maybeSingle();
    if (preferenceError && preferenceError.code !== "42P01" && preferenceError.code !== "PGRST205") throw preferenceError;
    const { error } = await db().from("user_job_source_subscriptions").upsert({
      user_id: user.id, source_id: sourceId, enabled: true,
      notify_email: typeof body.notifyEmail === "boolean" ? body.notifyEmail : preferences?.email_enabled === true,
      min_fit_score: Number.isFinite(Number(body.minFitScore)) ? Math.max(0, Math.min(100, Number(body.minFitScore))) : preferences?.minimum_fit_score ?? 45,
      subscribed_at: new Date().toISOString(),
    }, { onConflict: "user_id,source_id" });
    if (error) throw error;
    return NextResponse.json({ sourceId, subscribed: true });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to follow company" }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const sourceId = request.nextUrl.searchParams.get("sourceId");
    if (!sourceId) return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
    const { error } = await db().from("user_job_source_subscriptions").delete().eq("user_id", user.id).eq("source_id", sourceId);
    if (error) throw error;
    const { error: recommendationError } = await db().from("user_job_recommendations")
      .update({ active: false }).eq("user_id", user.id).eq("source_id", sourceId);
    if (recommendationError) throw recommendationError;
    return NextResponse.json({ sourceId, subscribed: false });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to unfollow company" }, { status });
  }
}
