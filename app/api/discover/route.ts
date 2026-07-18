import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { buildQuickFit } from "@/lib/discovery/matcher";
import { getOpenDiscoveryJobs, getUserBackground } from "@/lib/discovery/repository";
import type { DiscoveryJobCard } from "@/lib/discovery/types";

export const dynamic = "force-dynamic";

function includes(value: string | null | undefined, query: string) {
  return (value || "").toLowerCase().includes(query.toLowerCase());
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const [jobs, background] = await Promise.all([
      getOpenDiscoveryJobs(),
      getUserBackground(user.id),
    ]);

    const query = request.nextUrl.searchParams.get("query")?.trim() || "";
    const location = request.nextUrl.searchParams.get("location")?.trim() || "";
    const workplace = request.nextUrl.searchParams.get("workplace")?.trim() || "";
    const freshness = Number(request.nextUrl.searchParams.get("freshness") || 0);
    const cutoff = freshness > 0 ? Date.now() - freshness * 24 * 60 * 60 * 1000 : 0;

    const filtered = jobs.filter(job => {
      if (query && !includes(job.title, query) && !includes(job.company_name, query) && !includes(job.description, query)) return false;
      if (location && !includes(job.location, location)) return false;
      if (workplace && job.workplace_type !== workplace) return false;
      if (cutoff && new Date(job.discovered_at).getTime() < cutoff) return false;
      return true;
    });

    const cards: DiscoveryJobCard[] = filtered.map(job => {
      const { description_html: _html, parsed_requirements, ...card } = job;
      return {
        ...card,
        description_preview: job.description.slice(0, 240),
        quickFit: buildQuickFit(job, background),
      };
    });

    return NextResponse.json({ jobs: cards, hasBackground: Boolean(background.trim()) });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    console.error("Discover list error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load jobs" }, { status });
  }
}
