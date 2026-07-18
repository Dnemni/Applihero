import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { fetchGreenhouseBoard } from "@/lib/discovery/greenhouse";
import { supabaseAdmin } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

type ConfiguredBoard = { companyName: string; boardToken: string; includeTitleTerms?: string[] };

function configuredBoards(): ConfiguredBoard[] {
  const raw = process.env.GREENHOUSE_BOARDS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ConfiguredBoard[];
    return parsed.filter(item => item.companyName && /^[a-zA-Z0-9_-]+$/.test(item.boardToken));
  } catch {
    throw new Error("GREENHOUSE_BOARDS_JSON must be a JSON array of { companyName, boardToken }");
  }
}

async function ensureConfiguredSources(db: any) {
  const boards = configuredBoards();
  if (!boards.length) return;
  const rows = boards.map(board => ({
    provider: "greenhouse",
    external_key: board.boardToken,
    company_name: board.companyName,
    config: {
      boardToken: board.boardToken,
      ...(board.includeTitleTerms?.length ? { includeTitleTerms: board.includeTitleTerms } : {}),
    },
    enabled: true,
  }));
  const { error } = await db.from("job_sources").upsert(rows, { onConflict: "provider,external_key" });
  if (error) throw error;
}

export async function POST(request: NextRequest) {
  try {
    await requireApiUser(request);
    const db = supabaseAdmin as any;
    await ensureConfiguredSources(db);

    const { data: sources, error: sourceError } = await db
      .from("job_sources")
      .select("*")
      .eq("provider", "greenhouse")
      .eq("enabled", true);
    if (sourceError) throw sourceError;
    if (!sources?.length) {
      return NextResponse.json({
        synced: 0,
        message: "No Greenhouse sources are configured. Add job_sources rows or set GREENHOUSE_BOARDS_JSON.",
      });
    }

    let synced = 0;
    const failures: Array<{ company: string; error: string }> = [];

    for (const source of sources) {
      const startedAt = new Date().toISOString();
      await db.from("job_sources").update({ last_sync_started_at: startedAt }).eq("id", source.id);
      try {
        const boardToken = source.config?.boardToken || source.external_key;
        const fetchedJobs = await fetchGreenhouseBoard(boardToken);
        const includeTitleTerms = Array.isArray(source.config?.includeTitleTerms)
          ? source.config.includeTitleTerms.map((term: unknown) => String(term).toLowerCase().trim()).filter(Boolean)
          : [];
        const jobs = includeTitleTerms.length
          ? fetchedJobs.filter(job => includeTitleTerms.some((term: string) => job.title.toLowerCase().includes(term)))
          : fetchedJobs;
        const now = new Date().toISOString();
        const seen = new Set(jobs.map(job => job.source_job_id));

        if (jobs.length) {
          const rows = jobs.map(job => ({
            ...job,
            source_id: source.id,
            company_name: source.company_name,
            status: "open",
            consecutive_misses: 0,
            last_verified_at: now,
          }));
          const { error: upsertError } = await db
            .from("discovery_jobs")
            .upsert(rows, { onConflict: "source_id,source_job_id" });
          if (upsertError) throw upsertError;
        }

        const { data: existing, error: existingError } = await db
          .from("discovery_jobs")
          .select("id, source_job_id, consecutive_misses")
          .eq("source_id", source.id)
          .neq("status", "closed");
        if (existingError) throw existingError;

        for (const item of existing || []) {
          if (seen.has(item.source_job_id)) continue;
          const misses = (item.consecutive_misses || 0) + 1;
          await db.from("discovery_jobs").update({
            consecutive_misses: misses,
            status: misses >= 2 ? "closed" : "unverified",
          }).eq("id", item.id);
        }

        await db.from("job_sources").update({
          last_sync_completed_at: now,
          last_sync_error: null,
          consecutive_failures: 0,
        }).eq("id", source.id);
        synced += jobs.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ company: source.company_name, error: message });
        await db.from("job_sources").update({
          last_sync_error: message,
          consecutive_failures: (source.consecutive_failures || 0) + 1,
        }).eq("id", source.id);
      }
    }

    return NextResponse.json({ synced, sources: sources.length, failures });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    console.error("Greenhouse sync error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to sync jobs" }, { status });
  }
}
