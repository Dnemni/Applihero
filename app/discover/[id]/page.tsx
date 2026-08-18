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
  MessageCircle,
  MapPin,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { Header } from "@/components/header";
import { OnboardingOverlay, type OnboardingStep } from "@/components/onboarding-overlay";
import { toast } from "@/components/toast";
import { discoveryFetch } from "@/lib/discovery/client";
import { advanceOnboarding, getOnboardingState, setOnboardingState, shouldShowOnboarding } from "@/lib/onboarding-state";
import type { DiscoveryApplicationState, DiscoveryJob, EligibilityStatus, FitBand, JobFitAnalysis, QuickFit, RequirementFit, RequirementMatchStatus } from "@/lib/discovery/types";

type DiscoveryQuestion = { key: string; category: string; prompt: string; sourceRequirement: string; options: Array<{ label: string; value: string }> };
type DiscoveryAnswer = { question_key: string; answer: string; normalized_value: string; reuse_approved: boolean; provided_at: string };

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

const priorityStyles: Record<JobFitAnalysis["recommendation"]["priority"], string> = {
  high: "border-emerald-200 bg-emerald-50 text-emerald-950",
  medium: "border-blue-200 bg-blue-50 text-blue-950",
  low: "border-slate-200 bg-slate-50 text-slate-900",
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
  const [application, setApplication] = useState<DiscoveryApplicationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [questions, setQuestions] = useState<DiscoveryQuestion[]>([]);
  const [answers, setAnswers] = useState<DiscoveryAnswer[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
  const [reuseAnswers, setReuseAnswers] = useState<Record<string, boolean>>({});
  const [savingAnswer, setSavingAnswer] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  const onboardingSteps: OnboardingStep[] = [
    {
      title: "Review the official role",
      description: "This page keeps the official posting, source link, dates, location, and application action together so you can verify the opportunity before investing time.",
      targetId: "discovery-job-header",
      position: "bottom",
    },
    {
      title: "Understand the score",
      description: "The score checks explicit eligibility first and then how much of the employer's real requirements your background supports. It is a prioritization tool, not a hiring prediction.",
      targetId: "fit-analysis-section",
      position: "right",
    },
    {
      title: "Eligibility is handled separately",
      description: "Hard conflicts such as an incompatible graduation window matter. Unknown details such as availability or work authorization do not lower the score simply because AppliHero cannot infer them.",
      targetId: "eligibility-card",
      position: "bottom",
      action: { label: questions.length ? "View questions" : "Continue", onClick: () => { if (questions.length) setShowQuestions(true); } },
    },
    {
      title: "Answer only what your documents cannot",
      description: "Answers are removed from this list as you save them. Approved reusable answers can support other matches, and AppliHero will not ask the same question again for seven days unless it needs reconfirmation.",
      targetId: questions.length ? "eligibility-question-panel" : "eligibility-card",
      position: "left",
      action: { label: "Continue", onClick: () => setShowQuestions(false) },
    },
    {
      title: "Read the decision brief",
      description: "Analyze fit compares the complete posting with your profile, summarizes the role and your strongest evidence, calls out meaningful gaps, and recommends whether this application deserves high, medium, or low priority.",
      targetId: "fit-analysis-section",
      position: "right",
    },
    {
      title: "Move promising roles into your workspace",
      description: "Start application creates an application workspace where you can prepare answers, cover letters, referrals, and a tailored résumé using this verified posting.",
      targetId: "start-application-button",
      position: "bottom",
    },
  ];

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      const response = await discoveryFetch(`/api/discover/${params.id}/analyze`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to analyze fit");
      setAnalysis(payload.analysis);
      if (payload.quickFit) setQuickFit(payload.quickFit);
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
        const [response, questionResponse] = await Promise.all([
          discoveryFetch(`/api/discover/${params.id}`),
          discoveryFetch(`/api/discover/${params.id}/questions`),
        ]);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load job");
        setJob(payload.job);
        setQuickFit(payload.quickFit);
        setAnalysis(payload.analysis || null);
        setApplication(payload.application || null);
        if (!payload.analysis && payload.hasBackground) void runAnalysis();
        if (questionResponse.ok) {
          const questionPayload = await questionResponse.json();
          setQuestions(questionPayload.questions || []);
          setAnswers(questionPayload.answers || []);
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Unable to load job";
        setError(message);
        if (message === "Authentication required" || message.includes("session")) router.push("/login");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id, router]);

  useEffect(() => {
    shouldShowOnboarding("discover-detail").then(async should => {
      if (!should) return;
      const state = await getOnboardingState();
      setOnboardingStep(Math.min(state?.step || 0, onboardingSteps.length - 1));
      setShowOnboarding(true);
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  async function moveOnboarding(nextStep: number) {
    const bounded = Math.max(0, Math.min(nextStep, onboardingSteps.length - 1));
    setOnboardingStep(bounded);
    const state = await getOnboardingState();
    if (state?.phase === "discover-detail") await setOnboardingState({ ...state, step: bounded });
  }

  async function finishDiscoveryDetailOnboarding() {
    setShowOnboarding(false);
    setShowQuestions(false);
    await advanceOnboarding("discover-detail", "job-creation");
    router.push("/dashboard/new");
  }

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

  async function saveAnswer(question: DiscoveryQuestion) {
    const value = draftAnswers[question.key];
    if (!value) return;
    setSavingAnswer(question.key);
    try {
      const response = await discoveryFetch(`/api/discover/${params.id}/questions`, { method: "POST", body: JSON.stringify({
        questionKey: question.key,
        value,
        reuseApproved: reuseAnswers[question.key] === true,
      }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save answer");
      setAnswers(payload.answers || []);
      setQuestions(payload.questions || []);
      setQuickFit(payload.quickFit);
      setAnalysis(null);
      setDraftAnswers(items => {
        const next = { ...items };
        delete next[question.key];
        return next;
      });
      if (!(payload.questions || []).length) setShowQuestions(false);
      toast.success("Answer saved", reuseAnswers[question.key] ? "AppliHero can use it for future matching." : "It will only be used for this role.");
    } catch (caught) { toast.error("Could not save answer", caught instanceof Error ? caught.message : "Try again"); }
    finally { setSavingAnswer(""); }
  }

  // The headline score is the same persisted recommendation used by the feed.
  // A current detailed analysis is canonical until its profile/job inputs change.
  const fit = quickFit;
  const eligibility = quickFit?.eligibility;
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

        <section id="discovery-job-header" className="mt-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
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
              <button id="start-application-button" onClick={handleStartApplication} disabled={starting || job.status === "closed"} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{starting ? <Loader2 className="h-4 w-4 animate-spin" /> : application ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}{starting ? "Opening workspace" : application ? application.status === "Submitted" ? "View submitted application" : "Continue application" : "Start application"}</button>
            </div>
          </div>
          {application && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm"><div><span className="font-semibold text-indigo-950">Already in your applications</span><span className="ml-2 text-indigo-700">{application.status}</span></div><button onClick={() => router.push(`/jobs/${application.id}`)} className="font-semibold text-indigo-700 hover:text-indigo-950">Open workspace <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></button></div>}
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500"><span>Found {formatDate(job.discovered_at)}</span><span>Verified {formatDate(job.last_verified_at)}</span><span>Deadline {formatDate(job.application_deadline)}</span></div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section id="fit-analysis-section" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-sm font-semibold text-indigo-600">Eligibility and evidence</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">How this role lines up</h2></div>
                {fit && <div className={`shrink-0 rounded-lg border px-3 py-2 text-right ${bandStyles[fit.band]}`}><p className="text-[11px] font-semibold uppercase tracking-wide">{fit.label}</p><p className="text-2xl font-bold">{fit.score ?? "—"}<span className="text-xs font-medium opacity-60">/100</span></p></div>}
              </div>

              {eligibility && <div id="eligibility-card" className={`mt-5 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${eligibilityStyles[eligibility.status]}`}><div><p className="text-sm font-semibold">{eligibility.label}</p><p className="mt-1 text-sm leading-6 opacity-80">{eligibility.reasons[0]}</p></div>{eligibility.status === "unknown" && questions.length > 0 && <button onClick={() => setShowQuestions(true)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-950 px-3.5 py-2 text-xs font-semibold text-white"><MessageCircle className="h-4 w-4" />Answer {questions.length === 1 ? "question" : `${questions.length} questions`}</button>}</div>}

              {analyzing ? (
                <div className="mt-5 flex items-center gap-3 rounded-lg bg-indigo-50 p-4 text-sm text-indigo-800"><Loader2 className="h-5 w-5 animate-spin" />Checking requirements against your supplied background...</div>
              ) : analysis ? (
                <>
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Fit summary</p>
                    <p className="mt-2 text-base leading-7 text-slate-700">{analysis.fitSummary}</p>

                    <div className="mt-5 grid gap-5 border-y border-slate-100 py-5 md:grid-cols-2 md:gap-8">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">The role</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{analysis.roleSummary}</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Your relevant background</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{analysis.applicantSummary}</p>
                      </div>
                    </div>

                    <div className={`mt-5 rounded-lg border p-4 ${priorityStyles[analysis.recommendation.priority]}`}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider opacity-60">Application recommendation</p>
                          <p className="mt-1 text-base font-semibold">{analysis.recommendation.label}</p>
                        </div>
                        <span className="w-fit shrink-0 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">{analysis.recommendation.priority} priority</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 opacity-80">{analysis.recommendation.rationale}</p>
                    </div>
                  </div>
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
      {showQuestions && <div className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[2px]" onClick={() => setShowQuestions(false)}>
        <aside id="eligibility-question-panel" className="ml-auto flex h-full w-full max-w-md flex-col bg-[#fffdf8] shadow-2xl" onClick={event => event.stopPropagation()}>
          <div className="flex items-start justify-between border-b border-slate-200 px-5 py-5"><div><p className="text-xs font-semibold text-indigo-600">Improve this match</p><h2 className="mt-1 text-xl font-semibold">A few things only you know</h2><p className="mt-1 text-xs leading-5 text-slate-500">Unknown answers never count against you.</p></div><button onClick={() => setShowQuestions(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {questions.map(question => {
              const existing = answers.find(answer => answer.question_key === question.key);
              return <div key={question.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700"><MessageCircle className="h-4 w-4" /></span><div><p className="text-sm font-semibold leading-6">{question.prompt}</p><p className="mt-1 text-xs leading-5 text-slate-500">The posting says: “{question.sourceRequirement}”</p></div></div>
                {existing && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><strong>Your answer:</strong> {existing.answer}<span className="block mt-0.5 opacity-70">Given {formatDate(existing.provided_at)} · {existing.reuse_approved ? "approved for future matches" : "this role only"}</span></div>}
                <div className="mt-3 grid gap-2">{question.options.map(option => <button key={option.value} onClick={() => setDraftAnswers(items => ({ ...items, [question.key]: option.value }))} className={`rounded-lg border px-3 py-2.5 text-left text-sm transition ${draftAnswers[question.key] === option.value ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-slate-200 hover:border-slate-300"}`}>{option.label}</button>)}</div>
                <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-600"><input type="checkbox" checked={reuseAnswers[question.key] === true} onChange={event => setReuseAnswers(items => ({ ...items, [question.key]: event.target.checked }))} className="mt-1" /><span>Use this answer for future job matching. You can change it later; AppliHero records when you provided it.</span></label>
                <button onClick={() => saveAnswer(question)} disabled={!draftAnswers[question.key] || savingAnswer === question.key} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 text-sm font-semibold text-white disabled:opacity-50">{savingAnswer === question.key && <Loader2 className="h-4 w-4 animate-spin" />}{existing ? "Update answer" : "Save answer"}</button>
              </div>;
            })}
          </div>
        </aside>
      </div>}
      {showOnboarding && <OnboardingOverlay
        steps={onboardingSteps}
        currentStep={onboardingStep}
        onNext={() => void moveOnboarding(onboardingStep + 1)}
        onPrevious={() => void moveOnboarding(onboardingStep - 1)}
        onSkip={() => void finishDiscoveryDetailOnboarding()}
        onComplete={() => void finishDiscoveryDetailOnboarding()}
      />}
    </div>
  );
}
