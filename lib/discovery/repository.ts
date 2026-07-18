import { supabaseAdmin } from "@/lib/supabase/client";
import type { DiscoveryJob } from "./types";

const db = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured");
  return supabaseAdmin as any;
};

export async function getDiscoveryJob(id: string): Promise<DiscoveryJob | null> {
  const { data, error } = await db()
    .from("discovery_jobs")
    .select("*, job_sources(provider, company_name, external_key)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as DiscoveryJob | null;
}

export async function getUserBackground(userId: string): Promise<string> {
  const { data, error } = await db()
    .from("profiles")
    .select("resume_text, transcript_text, bio")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return [data?.resume_text, data?.transcript_text, data?.bio].filter(Boolean).join("\n\n");
}

export async function getOpenDiscoveryJobs(limit = 200): Promise<DiscoveryJob[]> {
  const { data, error } = await db()
    .from("discovery_jobs")
    .select("*, job_sources(provider, company_name, external_key)")
    .neq("status", "closed")
    .order("discovered_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as DiscoveryJob[];
}

export async function getCachedMatch(args: {
  userId: string;
  jobId: string;
  profileHash: string;
  jobHash: string;
  matcherVersion: string;
}) {
  const { data, error } = await db()
    .from("job_match_runs")
    .select("result")
    .eq("user_id", args.userId)
    .eq("discovery_job_id", args.jobId)
    .eq("profile_hash", args.profileHash)
    .eq("job_hash", args.jobHash)
    .eq("matcher_version", args.matcherVersion)
    .maybeSingle();
  if (error) throw error;
  return data?.result || null;
}

export async function saveMatch(args: {
  userId: string;
  jobId: string;
  profileHash: string;
  jobHash: string;
  matcherVersion: string;
  result: unknown;
}) {
  const { error } = await db().from("job_match_runs").upsert({
    user_id: args.userId,
    discovery_job_id: args.jobId,
    profile_hash: args.profileHash,
    job_hash: args.jobHash,
    matcher_version: args.matcherVersion,
    result: args.result,
  }, { onConflict: "user_id,discovery_job_id,profile_hash,job_hash,matcher_version" });
  if (error) throw error;
}

