"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Clock3,
  ExternalLink,
  Filter,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Header } from "@/components/header";
import { toast } from "@/components/toast";
import { discoveryFetch } from "@/lib/discovery/client";
import type { DiscoveryJobCard, EligibilityStatus, FitBand } from "@/lib/discovery/types";

const bandStyles: Record<FitBand, string> = {
  strong: "bg-emerald-50 text-emerald-700",
  potential: "bg-blue-50 text-blue-700",
  needs_information: "bg-amber-50 text-amber-800",
  likely_conflict: "bg-rose-50 text-rose-700",
};

const eligibilityStyles: Record<EligibilityStatus, string> = {
  aligned: "text-emerald-700",
  unknown: "text-amber-700",
  conflict: "text-rose-700",
};

function timeAgo(value: string | null): string {
  if (!value) return "Date not provided";
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

export default function DiscoverPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<DiscoveryJobCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [hasBackground, setHasBackground] = useState(false);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [workplace, setWorkplace] = useState("");
  const [freshness, setFreshness] = useState("7");

  async function loadJobs() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("query", query.trim());
      if (location.trim()) params.set("location", location.trim());
      if (workplace) params.set("workplace", workplace);
      if (freshness) params.set("freshness", freshness);
      const response = await discoveryFetch(`/api/discover?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load jobs");
      setJobs(payload.jobs || []);
      setHasBackground(Boolean(payload.hasBackground));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to load jobs";
      setError(message);
      if (message === "Authentication required" || message.includes("session")) router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJobs();
    // Initial load uses the default filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const strongCount = useMemo(() => jobs.filter(job => job.quickFit.band === "strong").length, [jobs]);
  const conflictCount = useMemo(() => jobs.filter(job => job.quickFit.eligibility.status === "conflict").length, [jobs]);

  function handleFilter(event: FormEvent) {
    event.preventDefault();
    loadJobs();
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const response = await discoveryFetch("/api/discover/sync", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to refresh job sources");
      if (payload.message) toast.info("Discovery sources", payload.message);
      else toast.success("Sources refreshed", `${payload.synced} postings verified across ${payload.sources} sources.`);
      await loadJobs();
    } catch (caught) {
      toast.error("Refresh failed", caught instanceof Error ? caught.message : "Unable to refresh jobs");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <Header showDashboard showProfile />

      <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 border-b border-slate-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-indigo-600">Job discovery</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Roles worth a closer look</h1>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Fresh postings from official career sites, ranked by eligibility first and résumé evidence second.
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Refreshing" : "Refresh sources"}
          </button>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 py-5 text-sm text-slate-600">
          <span><strong className="font-semibold text-slate-950">{jobs.length}</strong> roles</span>
          <span><strong className="font-semibold text-emerald-700">{strongCount}</strong> strong evidence matches</span>
          <span><strong className="font-semibold text-rose-700">{conflictCount}</strong> eligibility conflicts</span>
        </div>

        {!hasBackground && !loading && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Add your résumé for personalized eligibility and evidence checks.</p>
              <a href="/profile" className="mt-1 inline-flex font-semibold underline underline-offset-4">Open profile</a>
            </div>
          </div>
        )}

        <form onSubmit={handleFilter} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_155px_145px_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Role, company, or skill" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
            </label>
            <label className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input value={location} onChange={event => setLocation(event.target.value)} placeholder="Location" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
            </label>
            <select aria-label="Workplace" value={workplace} onChange={event => setWorkplace(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-indigo-400">
              <option value="">Any workplace</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="on-site">On-site</option>
            </select>
            <select aria-label="Freshness" value={freshness} onChange={event => setFreshness(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-indigo-400">
              <option value="1">Last day</option><option value="3">Last 3 days</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="">Any time</option>
            </select>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"><Filter className="h-4 w-4" />Filter</button>
          </div>
        </form>

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Available roles</h2>
          <p className="text-sm text-slate-500">Newest discoveries first</p>
        </div>

        {loading ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white py-20 text-center"><RefreshCw className="mx-auto h-6 w-6 animate-spin text-slate-400" /><p className="mt-3 text-sm text-slate-500">Loading roles...</p></div>
        ) : error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-800"><p className="font-semibold">Discovery could not load.</p><p className="mt-2 text-sm">{error}</p></div>
        ) : jobs.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><BriefcaseBusiness className="mx-auto h-9 w-9 text-slate-300" /><h3 className="mt-3 font-semibold">No roles match these filters.</h3><p className="mt-1 text-sm text-slate-500">Try a broader date, workplace, or location.</p></div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {jobs.map((job, index) => (
              <article key={job.id} className={`group p-5 transition hover:bg-slate-50 sm:p-6 ${index ? "border-t border-slate-200" : ""}`}>
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_210px_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1 font-medium"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />Official {job.job_sources?.provider || "career site"}</span>
                      {job.employment_type && <><span>·</span><span className="capitalize">{job.employment_type}</span></>}
                      {job.workplace_type && <><span>·</span><span className="capitalize">{job.workplace_type}</span></>}
                    </div>
                    <h3 className="mt-2 text-lg font-semibold leading-6 text-slate-950">{job.title}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1.5"><Building2 className="h-4 w-4" />{job.company_name}</span>
                      {job.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{job.location}</span>}
                      <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4" />Posted {timeAgo(job.source_published_at)}</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${bandStyles[job.quickFit.band]}`}>{job.quickFit.label}</span>
                      <span className="text-lg font-semibold text-slate-950">{job.quickFit.score ?? "—"}<span className="text-xs font-normal text-slate-400">/100</span></span>
                    </div>
                    <p className={`mt-2 text-xs font-semibold ${eligibilityStyles[job.quickFit.eligibility.status]}`}>{job.quickFit.eligibility.label}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{job.quickFit.eligibility.reasons[0] || job.quickFit.reasons[0]}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={() => router.push(`/discover/${job.id}`)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-indigo-700">Review <ArrowRight className="h-4 w-4" /></button>
                    <a href={job.source_url} target="_blank" rel="noreferrer" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-900" aria-label="Open official posting"><ExternalLink className="h-4 w-4" /></a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
