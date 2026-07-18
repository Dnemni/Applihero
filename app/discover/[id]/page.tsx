"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  ExternalLink,
  FileSearch,
  Lightbulb,
  Loader2,
  MapPin,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { Header } from "@/components/header";
import { toast } from "@/components/toast";
import { discoveryFetch } from "@/lib/discovery/client";
import type { DiscoveryJob, EligibilityStatus, FitBand, JobFitAnalysis, QuickFit, RequirementFit, RequirementMatchStatus } from "@/lib/discovery/types";

const bandStyles: Record<FitBand, string> = {
  strong: "bg-emerald-50 text-emerald-800 border-emerald-200",
  potential: "bg-blue-50 text-blue-800 border-blue-200",
  needs_information: "bg-amber-50 text-amber-900 border-amber-200",
  likely_conflict: "bg-rose-50 text-rose-800 border-rose-200",
};

const eligibilityStyles: Record<EligibilityStatus, string> = {
  aligned: "border-emerald-200 bg-emerald-50 text-emerald-900",
  unknown: "border-amber-200 bg-amber-50 text-amber-950",
  conflict: "border-rose-200 bg-rose-50 text-rose-950",
};

const statusConfig: Record<RequirementMatchStatus, { label: string; style: string; icon: typeof Check }> = {
  supported: { label: "Supported", style: "bg-emerald-50 text-emerald-700", icon: Check },
  partially_supported: { label: "Partial evidence", style: "bg-blue-50 text-blue-700", icon: CircleHelp },
  not_evidenced: { label: "Not evidenced", style: "bg-slate-100 text-slate-600", icon: X },
  conflicting: { label: "Conflict", style: "bg-rose-50 text-rose-700", icon: TriangleAlert },
  needs_confirmation: { label: "Confirm", style: "bg-amber-50 text-amber-800", icon: CircleHelp },
};

function formatDate(value: string | null) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function RequirementCard({ item }: { item: RequirementFit }) {
  const [expanded, setExpanded] = useState(item.status === "conflicting" || item.status === "needs_confirmation");
  const config = statusConfig[item.status];
  const Icon = config.icon;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button onClick={() => setExpanded(value => !value)} className="flex w-full items-start justify-between gap-4 p-4 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${config.style}`}><Icon className="h-3 w-3" />{config.label}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{item.priority}</span>
          </div>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-900">{item.requirement}</p>
        </div>
        {expanded ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400" />}
      </button>
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          <p className="text-sm leading-6 text-slate-600">{item.explanation}</p>
          {item.evidence.map((evidence, index) => <blockquote key={index} className="mt-2 rounded-lg border-l-2 border-indigo-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">“{evidence}”</blockquote>)}
        </div>
      )}
    </div>
  );
}

export default function DiscoverJobPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<DiscoveryJob | null>(null);
  const [quickFit, setQuickFit] = useState<QuickFit | null>(null);
  const [analysis, setAnalysis] = useState<JobFitAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [showDescription, setShowDescription] = useState(false);

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      const response = await discoveryFetch(`/api/discover/${params.id}/analyze`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to analyze fit");
      setAnalysis(payload.analysis);
    } catch (caught) {
      toast.error("Fit analysis unavailable", caught instanceof Error ? caught.message : "Unable to analyze this role");
    } finally {
      setAnalyzing(false);
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const response = await discoveryFetch(`/api/discover/${params.id}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load job");
        setJob(payload.job);
        setQuickFit(payload.quickFit);
        if (payload.hasBackground) {
          setAnalyzing(true);
          const analysisResponse = await discoveryFetch(`/api/discover/${params.id}/analyze`, { method: "POST" });
          const analysisPayload = await analysisResponse.json();
          if (analysisResponse.ok) setAnalysis(analysisPayload.analysis);
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Unable to load job";
        setError(message);
        if (message === "Authentication required" || message.includes("session")) router.push("/login");
      } finally {
        setAnalyzing(false);
        setLoading(false);
      }
    }
    load();
  }, [params.id, router]);

  async function handleStartApplication() {
    setStarting(true);
    try {
      const response = await discoveryFetch(`/api/discover/${params.id}/start`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to start application");
      toast.success(payload.existing ? "Opening your workspace" : "Application workspace created");
      router.push(`/jobs/${payload.jobId}`);
    } catch (caught) {
      toast.error("Could not start application", caught instanceof Error ? caught.message : "Please try again");
      setStarting(false);
    }
  }

  const fit = analysis || quickFit;
  const eligibility = analysis?.eligibility || quickFit?.eligibility;
  const groupedRequirements = useMemo(() => ({
    minimum: analysis?.requirements.filter(item => item.priority === "minimum") || [],
    preferred: analysis?.requirements.filter(item => item.priority === "preferred") || [],
  }), [analysis]);

  if (loading) return <div className="min-h-screen bg-slate-50"><Header showDashboard showProfile /><div className="flex min-h-[70vh] items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Reviewing official posting...</div></div>;
  if (error || !job) return <div className="min-h-screen bg-slate-50"><Header showDashboard showProfile /><div className="mx-auto max-w-xl px-6 py-24 text-center"><AlertCircle className="mx-auto h-9 w-9 text-rose-400" /><h1 className="mt-4 text-xl font-semibold">This job could not be opened.</h1><p className="mt-2 text-sm text-slate-500">{error}</p><button onClick={() => router.push("/discover")} className="mt-6 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Back to discovery</button></div></div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <Header showDashboard showProfile />
      <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-6 lg:px-8">
        <button onClick={() => router.push("/discover")} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-950"><ArrowLeft className="h-4 w-4" />Back to discovery</button>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />Verified {job.job_sources?.provider || "official source"}</span>
                {job.employment_type && <><span>·</span><span className="capitalize">{job.employment_type}</span></>}
                {job.workplace_type && <><span>·</span><span className="capitalize">{job.workplace_type}</span></>}
              </div>
              <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">{job.title}</h1>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Building2 className="h-4 w-4" />{job.company_name}</span>
                {job.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{job.location}</span>}
                <span className="inline-flex items-center gap-1.5"><BriefcaseBusiness className="h-4 w-4" />Posted {formatDate(job.source_published_at)}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <a href={job.source_url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Official posting <ExternalLink className="h-4 w-4" /></a>
              <button onClick={handleStartApplication} disabled={starting || job.status === "closed"} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{starting ? "Creating workspace" : "Start application"}</button>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500"><span>Found {formatDate(job.discovered_at)}</span><span>Verified {formatDate(job.last_verified_at)}</span><span>Deadline {formatDate(job.application_deadline)}</span></div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-sm font-semibold text-indigo-600">Eligibility and evidence</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">How this role lines up</h2></div>
                {fit && <div className={`shrink-0 rounded-lg border px-3 py-2 text-right ${bandStyles[fit.band]}`}><p className="text-[11px] font-semibold uppercase tracking-wide">{fit.label}</p><p className="text-2xl font-bold">{fit.score ?? "—"}<span className="text-xs font-medium opacity-60">/100</span></p></div>}
              </div>

              {eligibility && <div className={`mt-5 rounded-lg border p-4 ${eligibilityStyles[eligibility.status]}`}><p className="text-sm font-semibold">{eligibility.label}</p><p className="mt-1 text-sm leading-6 opacity-80">{eligibility.reasons[0]}</p></div>}

              {analyzing ? (
                <div className="mt-5 flex items-center gap-3 rounded-lg bg-indigo-50 p-4 text-sm text-indigo-800"><Loader2 className="h-5 w-5 animate-spin" />Checking requirements against your supplied background...</div>
              ) : analysis ? (
                <>
                  <p className="mt-5 text-sm leading-6 text-slate-600">{analysis.summary}</p>
                  <div className="mt-6"><h3 className="mb-3 text-sm font-semibold">Minimum requirements <span className="font-normal text-slate-400">({groupedRequirements.minimum.length})</span></h3><div className="space-y-2">{groupedRequirements.minimum.map((item, index) => <RequirementCard key={`${item.requirement}-${index}`} item={item} />)}</div></div>
                  {groupedRequirements.preferred.length > 0 && <div className="mt-6"><h3 className="mb-3 text-sm font-semibold">Preferred qualifications <span className="font-normal text-slate-400">({groupedRequirements.preferred.length})</span></h3><div className="space-y-2">{groupedRequirements.preferred.map((item, index) => <RequirementCard key={`${item.requirement}-${index}`} item={item} />)}</div></div>}
                </>
              ) : (
                <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-6 text-center"><FileSearch className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-sm text-slate-600">Run the detailed evidence comparison.</p><button onClick={runAnalysis} className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Analyze fit</button></div>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <button onClick={() => setShowDescription(value => !value)} className="flex w-full items-center justify-between p-5 text-left"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Official source</p><h2 className="mt-1 font-semibold">Full job description</h2></div>{showDescription ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}</button>
              {showDescription && <div className="whitespace-pre-wrap border-t border-slate-100 p-5 text-sm leading-7 text-slate-600">{job.description}</div>}
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold">Match summary</h2>
              <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Strong evidence</p>{analysis?.strengths.length ? <div className="mt-2 space-y-3">{analysis.strengths.slice(0, 3).map((item, index) => <div key={index}><p className="text-sm font-medium">{item.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">“{item.evidence}”</p></div>)}</div> : <p className="mt-2 text-sm text-slate-500">Available after analysis.</p>}</div>
              <div className="mt-5 border-t border-slate-100 pt-5"><p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Gaps and unknowns</p>{analysis?.gaps.length ? <div className="mt-2 space-y-3">{analysis.gaps.slice(0, 3).map((item, index) => <div key={index}><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.action}</p></div>)}</div> : <p className="mt-2 text-sm text-slate-500">Available after analysis.</p>}</div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-indigo-600" /><h2 className="font-semibold">Next steps</h2></div>
              {analysis?.coachingActions.length ? <ol className="mt-3 space-y-3">{analysis.coachingActions.slice(0, 3).map((action, index) => <li key={index} className="flex gap-3 text-sm leading-6 text-slate-600"><span className="font-semibold text-indigo-600">{index + 1}.</span>{action}</li>)}</ol> : <p className="mt-3 text-sm leading-6 text-slate-500">Specific next steps appear after analysis.</p>}
            </section>

            <p className="px-1 text-xs leading-5 text-slate-500">This score checks explicit eligibility first, then documented evidence. It is not a hiring probability. The employer makes the final decision.</p>
          </aside>
        </div>
      </main>
    </div>
  );
}
