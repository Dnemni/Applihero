"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Bell, BriefcaseBusiness, Building2, CalendarDays, Check,
  ChevronDown, CircleAlert, ExternalLink, MapPin, Plus, RefreshCw,
  Search, Settings2, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { Header } from "@/components/header";
import { OnboardingOverlay, type OnboardingStep } from "@/components/onboarding-overlay";
import { toast } from "@/components/toast";
import { DiscoveryFeedRequestError, discoveryFetch, fetchDiscoveryFeedPage, invalidateDiscoveryFeedCache } from "@/lib/discovery/client";
import { advanceOnboarding, getOnboardingState, setOnboardingState, shouldShowOnboarding } from "@/lib/onboarding-state";
import type { DiscoveryFeedResponse, DiscoveryJobCard, DiscoveryNotification, DiscoverySource, DiscoverySourceRecommendation, DiscoverySourceSuggestion, EligibilityStatus } from "@/lib/discovery/types";

const eligibilityStyles: Record<EligibilityStatus, { dot: string; text: string; score: string }> = {
  aligned: { dot: "bg-emerald-500", text: "text-emerald-700", score: "text-emerald-700" },
  unknown: { dot: "bg-amber-400", text: "text-amber-800", score: "text-gray-900" },
  conflict: { dot: "bg-rose-500", text: "text-rose-700", score: "text-rose-700" },
};
const INTERACTIVE_SOURCE_BATCH_SIZE = 6;
const FEED_PAGE_SIZE = 50;
type FeedFilters = { query: string; company: string; location: string; workplace: string; freshness: string; scope: "matches" | "all"; useSavedLocation: boolean };

function companyInitials(company: string) {
  return company.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function providerLabel(provider: DiscoverySource["provider"]) {
  return provider === "ibm" ? "IBM" : provider === "workday" ? "Workday" : provider.replace("_", " ");
}

function timeAgo(value: string | null): string {
  if (!value) return "Date unavailable";
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function sourceFreshnessLabel(source: DiscoverySource) {
  const task = source.ingestion_task;
  if (task?.status === "running") return "Updating now";
  if (task?.status === "queued") return "Queued for check";
  if (task?.status === "retry_wait") return "Retry scheduled";
  if (task?.status === "failed") return "Needs attention";
  if (source.last_successful_scan_at || source.last_sync_completed_at) return `Checked ${timeAgo(source.last_successful_scan_at || source.last_sync_completed_at || null)}`;
  return "Waiting for first check";
}

export default function DiscoverPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<DiscoveryJobCard[]>([]);
  const [resultSummary, setResultSummary] = useState<{ total: number; strong: number; stale: number; nextOffset: number | null; totalIsEstimate: boolean }>({ total: 0, strong: 0, stale: 0, nextOffset: null, totalIsEstimate: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [recommendationsLoaded, setRecommendationsLoaded] = useState(false);
  const [sources, setSources] = useState<DiscoverySource[]>([]);
  const [recommendedSources, setRecommendedSources] = useState<DiscoverySourceRecommendation[]>([]);
  const [selectedRecommendations, setSelectedRecommendations] = useState<string[]>([]);
  const [approvingRecommendations, setApprovingRecommendations] = useState(false);
  const [notifications, setNotifications] = useState<DiscoveryNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ completed: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [feedRetryable, setFeedRetryable] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [hasBackground, setHasBackground] = useState(false);
  const [hasSubscriptions, setHasSubscriptions] = useState(false);
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [workplace, setWorkplace] = useState("");
  const [freshness, setFreshness] = useState("");
  const [feedScope, setFeedScope] = useState<"matches" | "all">("matches");
  const [useSavedLocation, setUseSavedLocation] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showCompanies, setShowCompanies] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [manualCareerUrl, setManualCareerUrl] = useState("");
  const [showManualCareerUrl, setShowManualCareerUrl] = useState(false);
  const [companyDiscoveryFailed, setCompanyDiscoveryFailed] = useState(false);
  const [sourceSuggestion, setSourceSuggestion] = useState<DiscoverySourceSuggestion | null>(null);
  const [discoveringSource, setDiscoveringSource] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferences, setPreferences] = useState({ email_enabled: false, digest_frequency_minutes: 1440, minimum_fit_score: 45, preferred_country: "", preferred_regions: [] as string[], location_scope: "country" as "regions" | "country" | "worldwide", include_remote: true });
  const [preferredRegionsInput, setPreferredRegionsInput] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const jobRequestSequence = useRef(0);

  const onboardingSteps: OnboardingStep[] = [
    {
      title: "Your personalized job radar",
      description: "Discovery watches the official career pages you choose and keeps only roles that make sense for your profile. New matches appear here in posted-date order.",
      position: "center",
    },
    {
      title: "See what deserves attention",
      description: "This overview shows open matches, strong-fit roles, and how many companies AppliHero is monitoring for you.",
      targetId: "discover-overview",
      position: "bottom",
    },
    {
      title: "Narrow the feed",
      description: "Search by role or skill, filter by location and workplace type, and limit results by posting date. Match scores remain consistent between this list and each job page.",
      targetId: "discover-filters",
      position: "bottom",
    },
    {
      title: "Choose companies to monitor",
      description: "Start with verified companies in the catalog or search for another company. AppliHero identifies its official job source before you confirm it.",
      targetId: "companies-button",
      position: "bottom",
      action: { label: "Open companies", onClick: () => setShowCompanies(true) },
    },
    {
      title: "Follow companies and set alerts",
      description: "Following a company adds its current catalog matches without starting a provider scan. This panel also controls digest frequency and the minimum match score required for an email alert.",
      targetId: "companies-monitor-panel",
      position: "left",
      action: { label: "Continue", onClick: () => setShowCompanies(false) },
    },
    {
      title: "Refresh whenever you want",
      description: "Companies are checked periodically in the background. Scan now runs an immediate check when you do not want to wait for the next scheduled scan.",
      targetId: "scan-now-button",
      position: "bottom",
    },
    {
      title: "Open a match to review it",
      description: "Each result shows the verified source, posting date, eligibility signal, and one consistent fit score. Open a role to see the evidence and decide whether it is worth applying.",
      targetId: "discovery-results",
      position: "top",
    },
  ];

  function currentFilters(overrides?: Partial<FeedFilters>): FeedFilters {
    return {
      query: overrides?.query ?? query, company: overrides?.company ?? company, location: overrides?.location ?? location,
      workplace: overrides?.workplace ?? workplace, freshness: overrides?.freshness ?? freshness,
      scope: overrides?.scope ?? feedScope,
      useSavedLocation: overrides?.useSavedLocation ?? useSavedLocation,
    };
  }

  function applyFeedPage(payload: DiscoveryFeedResponse, append: boolean) {
    setJobs(current => {
      if (!append) return payload.jobs || [];
      const seen = new Set(current.map(job => job.id));
      return [...current, ...(payload.jobs || []).filter(job => !seen.has(job.id))];
    });
    setResultSummary({
      total: Number(payload.totalResults || 0), strong: Number(payload.strongResults || 0), stale: Number(payload.staleMatches || 0),
      nextOffset: payload.nextOffset ?? null, totalIsEstimate: Boolean(payload.totalIsEstimate),
    });
    setHasBackground(Boolean(payload.hasBackground));
    setHasSubscriptions(Boolean(payload.hasSubscriptions));
  }

  /**
   * Loads the first page for the given filters, or appends the next page when
   * `append` is set. Pages come through a bounded client cache keyed by user,
   * scope, filters, and offset, so navigating back is instant and identical
   * concurrent requests are deduplicated.
   */
  async function loadJobs(overrides?: Partial<FeedFilters>, options: { append?: boolean } = {}) {
    const requestId = ++jobRequestSequence.current;
    const append = Boolean(options.append && resultSummary.nextOffset !== null);
    if (append) setLoadingMore(true);
    else if (jobs.length === 0) setLoading(true);
    else setRefreshing(true);
    setError("");
    setFeedRetryable(false);
    try {
      const filters = currentFilters(overrides);
      const payload = await fetchDiscoveryFeedPage({ ...filters, offset: append ? resultSummary.nextOffset || 0 : 0, limit: FEED_PAGE_SIZE });
      if (requestId !== jobRequestSequence.current) return;
      applyFeedPage(payload, append);
      return payload;
    } catch (caught) {
      if (requestId !== jobRequestSequence.current) return;
      const message = caught instanceof Error ? caught.message : "Unable to load jobs";
      setError(message);
      setFeedRetryable(caught instanceof DiscoveryFeedRequestError && caught.status === 503);
      if (message === "Authentication required" || message.includes("session")) router.push("/login");
    } finally {
      if (requestId === jobRequestSequence.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }

  /** Bounded, user-initiated refresh of stored scores; the feed itself never recomputes. */
  async function refreshMatchScores() {
    setRematching(true);
    try {
      const response = await discoveryFetch("/api/discover/rematch", { method: "POST", body: JSON.stringify({ limit: 200 }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to refresh match scores");
      invalidateDiscoveryFeedCache();
      await loadJobs();
      toast.success("Match scores refreshed", payload.remaining ? `${payload.updated} updated; ${payload.remaining} more will finish in the background.` : `${payload.updated} score${payload.updated === 1 ? "" : "s"} updated.`);
    } catch (caught) { toast.error("Could not refresh scores", caught instanceof Error ? caught.message : "Try again shortly"); }
    finally { setRematching(false); }
  }

  async function loadCompanionData() {
    try {
      const [sourceResponse, notificationResponse, preferenceResponse] = await Promise.all([
        discoveryFetch("/api/discover/sources"), discoveryFetch("/api/discover/notifications"), discoveryFetch("/api/discover/preferences"),
      ]);
      const sourcePayload = await sourceResponse.json();
      const notificationPayload = await notificationResponse.json();
      if (!sourceResponse.ok) throw new Error(sourcePayload.error || "Unable to load companies");
      const loadedSources = sourcePayload.sources || [];
      setSources(loadedSources); setSourceError("");
      if (notificationResponse.ok) setNotifications(notificationPayload.notifications || []);
      if (preferenceResponse.ok) {
        const preferencePayload = await preferenceResponse.json();
        setPreferences(preferencePayload.preferences);
        setPreferredRegionsInput((preferencePayload.preferences.preferred_regions || []).join(", "));
      }
      return loadedSources as DiscoverySource[];
    } catch (caught) { setSourceError(caught instanceof Error ? caught.message : "Unable to load companies"); }
  }

  useEffect(() => {
    // The feed request gets the connection to itself. Companies, notifications,
    // and preferences load once the first page has arrived (or failed).
    void loadJobs().finally(() => { void loadCompanionData(); });
    shouldShowOnboarding("discover").then(async should => {
      if (!should) return;
      const state = await getOnboardingState();
      setOnboardingStep(Math.min(state?.step || 0, onboardingSteps.length - 1));
      setShowOnboarding(true);
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  useEffect(() => {
    // Ranking unfollowed companies scores postings against the profile on the
    // server; ask for it only when the panel that shows it is open.
    if (!showCompanies || recommendationsLoaded) return;
    setRecommendationsLoaded(true);
    discoveryFetch("/api/discover/sources?include=recommendations").then(async response => {
      const payload = await response.json();
      if (!response.ok) return;
      setRecommendedSources(payload.recommendations || []);
      setSelectedRecommendations((payload.recommendations || []).slice(0, 4).map((item: DiscoverySourceRecommendation) => item.sourceId));
    }).catch(() => { /* recommendations are optional */ });
  }, [showCompanies, recommendationsLoaded]);

  useEffect(() => {
    if (!jobs.length) return;
    // Preload the first visible detail routes in idle time. Opening a role then
    // feels like a continuation of the list rather than another cold load.
    const idle = window.setTimeout(() => jobs.slice(0, 12).forEach(job => router.prefetch(`/discover/${job.id}`)), 150);
    return () => window.clearTimeout(idle);
  }, [jobs, router]);

  async function moveOnboarding(nextStep: number) {
    const bounded = Math.max(0, Math.min(nextStep, onboardingSteps.length - 1));
    setOnboardingStep(bounded);
    const state = await getOnboardingState();
    if (state?.phase === "discover") await setOnboardingState({ ...state, step: bounded });
  }

  async function skipDiscoveryOnboarding() {
    setShowOnboarding(false);
    setShowCompanies(false);
    await advanceOnboarding("discover", "job-creation");
    router.push("/dashboard/new");
  }

  async function completeDiscoveryOnboarding() {
    if (!jobs.length) {
      setShowCompanies(true);
      await moveOnboarding(4);
      toast.info("Choose a company first", "Follow a company to add its current catalog matches.");
      return;
    }
    setShowOnboarding(false);
    await advanceOnboarding("discover", "discover-detail");
    router.push(`/discover/${jobs[0].id}`);
  }

  const unreadCount = notifications.filter(item => !item.read_at).length;
  const followedSources = sources.filter(source => source.subscribed);
  // The oldest completed source is the truthful freshness boundary: a newer
  // scan for one company must not make the entire monitored list look newer.
  const oldestCompletedScan = followedSources.map(source => source.last_sync_completed_at).filter((value): value is string => Boolean(value)).sort().at(0) || null;
  const staleFollowedSources = followedSources.filter(source => !source.last_sync_completed_at || Date.now() - new Date(source.last_sync_completed_at).getTime() >= 60 * 60_000);
  const dueSourceCount = followedSources.filter(source => !source.next_sync_at || new Date(source.next_sync_at).getTime() <= Date.now()).length;
  const activeSourceCount = followedSources.filter(source => ["queued", "running", "retry_wait"].includes(source.ingestion_task?.status || "")).length;
  const failedSourceCount = followedSources.filter(source => source.ingestion_task?.status === "failed" || source.last_sync_error).length;
  const companyFilterOptions = useMemo(() => Array.from(new Set([
    ...sources.map(source => source.company_name),
    ...jobs.map(job => job.company_name),
  ])).sort((left, right) => left.localeCompare(right)), [sources, jobs]);
  const visibleSources = useMemo(() => sources
    .filter(source => source.company_name.toLowerCase().includes(catalogQuery.trim().toLowerCase()))
    .sort((a, b) => Number(b.subscribed) - Number(a.subscribed) || a.company_name.localeCompare(b.company_name)), [sources, catalogQuery]);
  const suggestionAlreadyFollowed = Boolean(
    sourceSuggestion?.existingSourceId &&
    sources.some(source => source.id === sourceSuggestion.existingSourceId && source.subscribed)
  );

  function applyFilters(event?: FormEvent) { event?.preventDefault(); loadJobs(); }

  async function syncFollowedCompanyBatches(sourceIds: string[]) {
    let completed = 0;
    const results: Array<{ discovered: number; sources: number; failures: Array<{ error?: string }> }> = [];
    for (let index = 0; index < sourceIds.length; index += INTERACTIVE_SOURCE_BATCH_SIZE) {
      const batch = sourceIds.slice(index, index + INTERACTIVE_SOURCE_BATCH_SIZE);
      const response = await discoveryFetch("/api/discover/sync", {
        method: "POST",
        body: JSON.stringify({ sourceIds: batch }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to refresh companies");
      results.push(payload);
      completed += batch.length;
      setSyncProgress({ completed, total: sourceIds.length });
    }
    return results;
  }

  async function handleSync() {
    const sourceIds = (staleFollowedSources.length ? staleFollowedSources : followedSources).map(source => source.id);
    if (!sourceIds.length) {
      setShowCompanies(true);
      return;
    }
    setSyncing(true);
    setSyncProgress({ completed: 0, total: sourceIds.length });
    try {
      const batches = await syncFollowedCompanyBatches(sourceIds);
      const discovered = batches.reduce((sum, batch) => sum + Number(batch.discovered || 0), 0);
      const failures = batches.flatMap(batch => batch.failures || []);
      toast.success(failures.length ? "Company refresh finished with issues" : "Followed companies refreshed", discovered ? `${discovered} new role${discovered === 1 ? "" : "s"} found.` : `Checked ${sourceIds.length} followed ${sourceIds.length === 1 ? "company" : "companies"}.`);
      invalidateDiscoveryFeedCache();
      await Promise.all([loadJobs(), loadCompanionData()]);
    } catch (caught) { toast.error("Refresh failed", caught instanceof Error ? caught.message : "Unable to refresh jobs"); }
    finally { setSyncing(false); setSyncProgress(null); }
  }

  async function toggleSource(source: DiscoverySource) {
    const nextSubscribed = !source.subscribed;
    setSources(items => items.map(item => item.id === source.id ? { ...item, subscribed: nextSubscribed } : item));
    setHasSubscriptions(nextSubscribed || sources.some(item => item.id !== source.id && item.subscribed));
    try {
      const response = await discoveryFetch(source.subscribed ? `/api/discover/sources?sourceId=${source.id}` : "/api/discover/sources", {
        method: source.subscribed ? "DELETE" : "POST",
        ...(source.subscribed ? {} : { body: JSON.stringify({ sourceId: source.id }) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update company");
      invalidateDiscoveryFeedCache();
      toast.success(nextSubscribed ? "Company followed" : "Company unfollowed", nextSubscribed ? "Current catalog matches are ready; alerts start with the next regular scan." : "This company will no longer appear in Matches or alerts.");
      await Promise.all([loadCompanionData(), loadJobs()]);
    } catch (caught) {
      setSources(items => items.map(item => item.id === source.id ? { ...item, subscribed: source.subscribed } : item));
      toast.error("Company update failed", caught instanceof Error ? caught.message : "Unable to update company");
    }
  }

  async function findCompany(event: FormEvent) {
    event.preventDefault(); setDiscoveringSource(true); setSourceSuggestion(null);
    try {
      const response = await discoveryFetch("/api/discover/sources", { method: "POST", body: JSON.stringify({ companyName, careerUrl: manualCareerUrl, preview: true }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to find that company's job source");
      setSourceSuggestion(payload.suggestion); setCompanyDiscoveryFailed(false);
    } catch (caught) { setCompanyDiscoveryFailed(true); setShowManualCareerUrl(true); toast.error("Could not verify company", caught instanceof Error ? caught.message : "Try the company's full name"); }
    finally { setDiscoveringSource(false); }
  }

  async function approveRecommendedCompanies() {
    if (!selectedRecommendations.length) return;
    setApprovingRecommendations(true);
    try {
      for (const sourceId of selectedRecommendations) {
        const response = await discoveryFetch("/api/discover/sources", { method: "POST", body: JSON.stringify({ sourceId }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to follow recommended companies");
      }
      toast.success("Watch list approved", `${selectedRecommendations.length} companies are now being monitored.`);
      await loadCompanionData();
      setSelectedRecommendations([]);
      invalidateDiscoveryFeedCache();
      await loadJobs();
    } catch (caught) {
      toast.error("Could not update watch list", caught instanceof Error ? caught.message : "Try again shortly");
    } finally {
      setApprovingRecommendations(false);
    }
  }

  async function confirmCompany() {
    if (!sourceSuggestion) return;
    if (suggestionAlreadyFollowed) {
      toast.info("Already following", `${sourceSuggestion.companyName} is already included in your feed.`);
      setSourceSuggestion(null);
      return;
    }
    setSavingSource(true);
    try {
      const body = sourceSuggestion.existingSourceId
        ? { sourceId: sourceSuggestion.existingSourceId }
        : { companyName: sourceSuggestion.companyName, careerUrl: sourceSuggestion.careerUrl };
      const response = await discoveryFetch("/api/discover/sources", { method: "POST", body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to follow company");
      setCompanyName(""); setManualCareerUrl(""); setShowManualCareerUrl(false); setCompanyDiscoveryFailed(false); setSourceSuggestion(null);
      toast.success("Company followed", payload.seeded ? `${payload.seeded} current catalog roles were checked for matches.` : "Alerts start with the next regular catalog scan.");
      invalidateDiscoveryFeedCache();
      await Promise.all([loadCompanionData(), loadJobs()]);
    } catch (caught) { toast.error("Could not follow company", caught instanceof Error ? caught.message : "Try again shortly"); }
    finally { setSavingSource(false); }
  }

  async function markNotificationsRead() {
    await discoveryFetch("/api/discover/notifications", { method: "PATCH", body: JSON.stringify({}) });
    setNotifications(items => items.map(item => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
  }

  async function savePreferences(next = preferences, refreshMatches = false) {
    setSavingPreferences(true);
    try {
      const response = await discoveryFetch("/api/discover/preferences", { method: "PATCH", body: JSON.stringify({
        emailEnabled: next.email_enabled,
        digestFrequencyMinutes: next.digest_frequency_minutes,
        minimumFitScore: next.minimum_fit_score,
        preferredCountry: next.preferred_country,
        preferredRegions: preferredRegionsInput.split(",").map(item => item.trim()).filter(Boolean),
        locationScope: next.location_scope,
        includeRemote: next.include_remote,
      }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save alerts");
      setPreferences(payload.preferences);
      toast.success("Discovery preferences updated");
      // Location preferences are applied by the feed query itself, and any
      // answer change is recomputed by a bounded rematch of stored scores. A
      // preference save never rescans every followed company.
      invalidateDiscoveryFeedCache();
      if (refreshMatches) await refreshMatchScores();
      else await loadJobs();
    } catch (caught) { toast.error("Could not save alerts", caught instanceof Error ? caught.message : "Try again"); }
    finally { setSavingPreferences(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 text-gray-950">
      <Header showDashboard showProfile />
      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-7 sm:px-6 lg:px-8 lg:pt-10">
        <header id="discover-overview" className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-indigo-600">Discover</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Your job discovery feed</h1>
            <p className="mt-2 text-sm text-gray-600">
              {resultSummary.totalIsEstimate ? "About " : ""}{resultSummary.total.toLocaleString()} open {resultSummary.total === 1 ? "role" : "roles"}{resultSummary.strong ? ` · ${resultSummary.strong} strong ${resultSummary.strong === 1 ? "match" : "matches"}` : ""}
              {followedSources.length ? ` · ${followedSources.length} ${followedSources.length === 1 ? "company" : "companies"} monitored` : ""}
            </p>
          </div>
          <div className="relative flex flex-wrap items-center gap-2">
            <button onClick={() => { setShowNotifications(value => !value); if (!showNotifications && unreadCount) markNotificationsRead(); }} className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 shadow-sm transition hover:border-gray-400" aria-label="Job alerts">
              <Bell className="h-4 w-4" />{unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">{unreadCount}</span>}
            </button>
            <div className="flex flex-col items-end gap-1"><button id="scan-now-button" onClick={handleSync} disabled={syncing || followedSources.length === 0} className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-gray-400 disabled:cursor-default disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${syncing || activeSourceCount ? "animate-spin" : ""}`} />{syncing ? `Checking ${syncProgress?.completed || 0}/${syncProgress?.total || followedSources.length}` : staleFollowedSources.length ? `Refresh ${staleFollowedSources.length} outdated` : activeSourceCount ? `${activeSourceCount} updating` : `Sync ${followedSources.length} companies`}</button><span className="pr-1 text-[11px] text-gray-500">{activeSourceCount ? `${activeSourceCount} ${activeSourceCount === 1 ? "company" : "companies"} updating in background` : staleFollowedSources.length ? `Oldest check ${timeAgo(oldestCompletedScan)} · ${staleFollowedSources.length} outdated` : dueSourceCount ? `${dueSourceCount} due for a regular check` : oldestCompletedScan ? `All ${followedSources.length} followed companies checked ${timeAgo(oldestCompletedScan)}` : ""}</span></div>
            <button id="companies-button" onClick={() => setShowCompanies(true)} className="inline-flex h-10 items-center gap-2 rounded-full bg-gray-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"><Building2 className="h-4 w-4" />Companies</button>
            {showNotifications && (
              <div className="absolute right-0 top-12 z-30 w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3"><p className="font-semibold">Job alerts</p><button onClick={() => setShowNotifications(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button></div>
                <div className="max-h-96 overflow-y-auto">{notifications.length ? notifications.map(item => <button key={item.id} onClick={() => item.job_ids[0] && router.push(`/discover/${item.job_ids[0]}`)} className="block w-full border-b border-gray-100 px-4 py-4 text-left transition last:border-0 hover:bg-amber-50"><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs leading-5 text-gray-600">{item.body}</p><p className="mt-2 text-[11px] text-gray-400">{timeAgo(item.created_at)}</p></button>) : <p className="px-5 py-10 text-center text-sm text-gray-500">New matches will appear here.</p>}</div>
              </div>
            )}
          </div>
        </header>

        {!hasBackground && !loading && <div className="mt-6 flex items-center gap-3 border-y border-amber-200 py-3 text-sm text-amber-950"><Sparkles className="h-4 w-4 shrink-0" /><span><strong>Add your résumé</strong> to unlock evidence-based matching and new-job alerts.</span><a href="/profile" className="ml-auto shrink-0 font-semibold text-indigo-700 underline underline-offset-4">Complete profile</a></div>}
        {!hasSubscriptions && !loading && <div className="mt-6 flex items-center gap-3 border-y border-indigo-200 py-3 text-sm text-indigo-950"><Building2 className="h-4 w-4 shrink-0" /><span>Search the full catalog now. Follow companies only when you want their roles in alerts and one-tap rescans.</span><button onClick={() => setShowCompanies(true)} className="ml-auto shrink-0 font-semibold text-indigo-700">Manage alerts</button></div>}

        <form id="discover-filters" onSubmit={applyFilters} className="mt-7">
          <div className="flex flex-col gap-3 rounded-[1.35rem] bg-white p-2 shadow-sm ring-1 ring-gray-200/80 md:flex-row md:items-center">
            <label className="flex min-w-0 flex-1 items-center gap-3 px-3"><Search className="h-4 w-4 shrink-0 text-gray-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Role, company, or skill" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" /></label>
            <div className="hidden h-7 w-px bg-gray-200 md:block" />
            <label className="flex min-w-0 flex-1 items-center gap-3 px-3 md:max-w-xs"><MapPin className="h-4 w-4 shrink-0 text-gray-400" /><input value={location} onChange={event => setLocation(event.target.value)} placeholder="City or region" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" /></label>
            <button className="h-11 rounded-2xl bg-indigo-600 px-6 text-sm font-semibold text-white transition hover:bg-indigo-700">Search</button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="mr-1 inline-flex rounded-full border border-gray-300 bg-white/80 p-1"><button type="button" onClick={() => { setFeedScope("matches"); void loadJobs({ scope: "matches" }); }} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${feedScope === "matches" ? "bg-gray-950 text-white" : "text-gray-600 hover:text-gray-950"}`}>Matches</button><button type="button" onClick={() => { setFeedScope("all"); void loadJobs({ scope: "all" }); }} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${feedScope === "all" ? "bg-gray-950 text-white" : "text-gray-600 hover:text-gray-950"}`}>All roles</button></div>
            {feedScope === "all" && <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray-300 bg-white/70 px-3.5 py-2 text-xs font-semibold text-gray-600"><input type="checkbox" checked={useSavedLocation} onChange={event => { const next = event.target.checked; setUseSavedLocation(next); void loadJobs({ useSavedLocation: next, scope: "all" }); }} className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600" />Only my location</label>}
            {["remote", "hybrid", "on-site"].map(value => <button type="button" key={value} onClick={() => { const next = workplace === value ? "" : value; setWorkplace(next); loadJobs({ workplace: next }); }} className={`rounded-full border px-3.5 py-2 text-xs font-semibold capitalize transition ${workplace === value ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-300 bg-white/70 text-gray-600 hover:border-gray-400"}`}>{value}</button>)}
            <button type="button" onClick={() => setShowMoreFilters(value => !value)} className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${showMoreFilters ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white/70 text-gray-600 hover:border-gray-400"}`}><Settings2 className="h-3.5 w-3.5" />More filters <ChevronDown className={`h-3.5 w-3.5 transition ${showMoreFilters ? "rotate-180" : ""}`} /></button>
            {(query || company || location || workplace || freshness) && <button type="button" onClick={() => { setQuery(""); setCompany(""); setLocation(""); setWorkplace(""); setFreshness(""); loadJobs({ query: "", company: "", location: "", workplace: "", freshness: "" }); }} className="px-2 py-2 text-xs font-semibold text-gray-500 hover:text-gray-900">Clear all</button>}
            <span className="ml-auto text-xs text-gray-500">Newest first</span>
          </div>
          {showMoreFilters && <div className="mt-3 flex flex-wrap items-end gap-4 border-y border-gray-200 py-4"><label><span className="block text-xs font-semibold text-gray-600">Company</span><select value={company} onChange={event => setCompany(event.target.value)} className="mt-1.5 h-10 min-w-48 rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-indigo-500"><option value="">All companies</option>{companyFilterOptions.map(name => <option key={name} value={name}>{name}</option>)}</select></label><label><span className="block text-xs font-semibold text-gray-600">Posted</span><select value={freshness} onChange={event => setFreshness(event.target.value)} className="mt-1.5 h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-indigo-500"><option value="">Any time</option><option value="1">Last 24 hours</option><option value="3">Last 3 days</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label><button type="submit" className="h-10 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white">Apply filters</button></div>}
        </form>

        <section id="discovery-results" className="mt-7 overflow-hidden rounded-[1.5rem] bg-white shadow-sm ring-1 ring-gray-200/80">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 sm:px-7"><h2 className="font-semibold">Latest openings</h2><span className="inline-flex items-center gap-2 text-xs text-gray-500">{refreshing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-500" />}{jobs.length < resultSummary.total ? `${jobs.length} of ${resultSummary.totalIsEstimate ? "about " : ""}${resultSummary.total.toLocaleString()}` : resultSummary.total.toLocaleString()} results</span></div>
          {feedScope === "matches" && resultSummary.stale > 0 && !loading && <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50/70 px-5 py-3 text-sm text-amber-950 sm:px-7"><RefreshCw className={`h-4 w-4 shrink-0 ${rematching ? "animate-spin" : ""}`} /><span>{resultSummary.stale} match {resultSummary.stale === 1 ? "score predates" : "scores predate"} your latest profile or posting changes. Scores refresh hourly in the background.</span><button type="button" onClick={() => void refreshMatchScores()} disabled={rematching} className="ml-auto shrink-0 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 transition hover:border-amber-400 disabled:opacity-60">{rematching ? "Refreshing…" : "Refresh scores now"}</button></div>}
          {loading ? <div className="py-24 text-center"><RefreshCw className="mx-auto h-6 w-6 animate-spin text-indigo-500" /><p className="mt-3 text-sm text-gray-500">Loading jobs…</p></div>
          : error ? <div className="py-20 text-center text-rose-700"><CircleAlert className="mx-auto h-7 w-7" /><p className="mt-3 font-semibold">Could not load jobs</p><p className="mt-1 text-sm">{error}</p>{feedRetryable && <button type="button" onClick={() => void loadJobs()} className="mt-4 rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 transition hover:border-rose-400">Try again</button>}</div>
          : jobs.length === 0 ? <div className="py-24 text-center"><BriefcaseBusiness className="mx-auto h-8 w-8 text-gray-300" />{feedScope === "all" ? <><p className="mt-4 font-semibold">No open catalog roles match these filters</p><p className="mt-1 text-sm text-gray-500">Clear a search or filter to return to the complete catalog.</p></> : activeSourceCount ? <><p className="mt-4 font-semibold">The catalog is updating</p><p className="mt-1 text-sm text-gray-500">{activeSourceCount} source{activeSourceCount === 1 ? " is" : "s are"} queued or updating. New matching roles will appear here automatically.</p></> : failedSourceCount ? <><p className="mt-4 font-semibold">A company check needs another try</p><p className="mt-1 text-sm text-gray-500">Your existing matches are safe. Open Companies to see which source is retrying.</p><button onClick={() => setShowCompanies(true)} className="mt-4 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">Review companies</button></> : <><p className="mt-4 font-semibold">No roles match this view</p><p className="mt-1 text-sm text-gray-500">Try broadening filters, viewing all roles, or adjusting your location preferences.</p></>}</div>
          : <div>{jobs.map(job => {
            const eligibility = job.fitState === "catalog" ? { dot: "bg-gray-300", text: "text-gray-500", score: "text-gray-500" } : eligibilityStyles[job.quickFit.eligibility.status];
            const reason = job.quickFit.eligibility.reasons[0] || job.quickFit.reasons[0];
            const matchReason = job.quickFit.reasons.find(item => item !== reason);
            return <article key={job.id} onClick={() => router.push(`/discover/${job.id}`)} className="group relative cursor-pointer border-b border-gray-200 px-5 py-6 transition last:border-0 hover:bg-amber-50/50 sm:px-7 sm:py-7">
              <div className={`absolute bottom-6 left-0 top-6 w-1 rounded-r-full ${eligibility.dot} opacity-0 transition group-hover:opacity-100`} />
              <div className="grid gap-5 sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:items-start">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-sm font-bold text-indigo-700 ring-1 ring-indigo-100">{companyInitials(job.company_name)}</div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs"><span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />Verified</span>{job.application && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${job.application.status === "Submitted" ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-800"}`}><Check className="h-3 w-3" />{job.application.status === "Submitted" ? "Submitted" : "In your applications"}</span>}{job.workplace_type && <span className="capitalize text-gray-500">{job.workplace_type}</span>}{job.employment_type && <span className="capitalize text-gray-500">{job.employment_type}</span>}<span className="text-gray-400">Posted {timeAgo(job.source_published_at || job.discovered_at)}</span></div>
                  <h3 className="mt-2 text-lg font-bold leading-6 text-gray-950 transition group-hover:text-indigo-700 sm:text-xl">{job.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500"><span className="inline-flex items-center gap-1.5"><Building2 className="h-4 w-4" />{job.company_name}</span>{job.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{job.location}</span>}</div>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600"><span className={`mr-2 inline-block h-2 w-2 rounded-full ${eligibility.dot}`} />{reason}</p>
                  {matchReason && <p className="mt-2 max-w-3xl text-xs leading-5 text-gray-500"><span className="font-semibold text-gray-700">Why this matches:</span> {matchReason}</p>}
                </div>
                <div className="flex items-center justify-between gap-3 sm:min-w-[126px] sm:flex-col sm:items-end">
                  <div className="text-left sm:text-right">{job.fitState === "catalog" ? <><p className="text-sm font-semibold text-gray-500">Not scored</p><p className="mt-1 text-[11px] text-gray-400">Open to review fit</p></> : <><p className={`text-2xl font-bold tabular-nums ${eligibility.score}`}>{job.quickFit.score ?? "—"}<span className="text-xs font-medium text-gray-400">/100</span></p><p className={`mt-1 text-[11px] font-semibold ${eligibility.text}`}>{job.fitState === "stale" ? "Score updating" : job.quickFit.eligibility.label}</p></>}</div>
                  <div className="flex items-center gap-2 sm:mt-5"><a href={job.source_url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:border-indigo-300 hover:text-indigo-600" aria-label="Open official posting"><ExternalLink className="h-4 w-4" /></a><span className="inline-flex h-9 items-center gap-1 rounded-full bg-gray-950 px-4 text-xs font-semibold text-white transition group-hover:bg-indigo-600">{job.application ? "Continue application" : "Review job"} <ArrowRight className="h-3.5 w-3.5" /></span></div>
                </div>
              </div>
            </article>;
          })}{resultSummary.nextOffset !== null && <div className="border-t border-gray-200 px-5 py-4 text-center"><button type="button" onClick={() => void loadJobs(undefined, { append: true })} disabled={loadingMore} className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-60">{loadingMore && <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-500" />}{loadingMore ? "Loading more…" : `Show ${Math.min(FEED_PAGE_SIZE, Math.max(0, resultSummary.total - jobs.length)) || FEED_PAGE_SIZE} more`}</button><p className="mt-2 text-[11px] text-gray-400">Showing {jobs.length} of {resultSummary.totalIsEstimate ? "about " : ""}{resultSummary.total.toLocaleString()}</p></div>}</div>}
        </section>
        <p className="mt-5 flex items-center justify-center gap-2 text-xs text-gray-500"><Check className="h-3.5 w-3.5 text-emerald-600" />Jobs are deduplicated and verified against their employer source.</p>
      </main>

      {showCompanies && <div className="fixed inset-0 z-40 bg-gray-950/25 backdrop-blur-[2px]" onClick={() => setShowCompanies(false)}>
        <aside id="companies-monitor-panel" className="ml-auto flex h-full w-full max-w-lg flex-col bg-[#fffdf8] shadow-2xl" onClick={event => event.stopPropagation()}>
          <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5"><div><h2 className="text-xl font-bold">Company alerts</h2><p className="mt-1 text-sm text-gray-500">The catalog scans every company. Follow only employers you want in alerts and available for a manual rescan.</p></div><button onClick={() => setShowCompanies(false)} className="rounded-full p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button></div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {sourceError && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{sourceError}</p>}
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Email digest</p><p className="mt-0.5 text-xs text-gray-500">Only new matches at or above your threshold.</p></div><button onClick={() => { const next = { ...preferences, email_enabled: !preferences.email_enabled }; setPreferences(next); void savePreferences(next); }} disabled={savingPreferences} className={`relative h-6 w-11 rounded-full transition ${preferences.email_enabled ? "bg-indigo-600" : "bg-gray-300"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${preferences.email_enabled ? "left-6" : "left-1"}`} /></button></div>
              <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-gray-600">Frequency<select value={preferences.digest_frequency_minutes < 60 ? 60 : preferences.digest_frequency_minutes} onChange={event => { const next = { ...preferences, digest_frequency_minutes: Number(event.target.value) }; setPreferences(next); void savePreferences(next); }} className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm"><option value={60}>Hourly</option><option value={360}>Every 6 hours</option><option value={1440}>Daily</option><option value={10080}>Weekly</option></select></label><label className="text-xs font-semibold text-gray-600">Minimum fit<select value={preferences.minimum_fit_score} onChange={event => { const next = { ...preferences, minimum_fit_score: Number(event.target.value) }; setPreferences(next); void savePreferences(next); }} className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm"><option value={45}>45 · Potential</option><option value={60}>60 · Good</option><option value={75}>75 · Strong</option></select></label></div>
            </div>
            <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">Where should we look?</p><p className="mt-0.5 text-xs leading-5 text-gray-500">Explicit preferences override guesses from your résumé.</p></div><MapPin className="h-4 w-4 text-indigo-600" /></div>
              <label className="mt-3 block text-xs font-semibold text-gray-600">Search scope<select value={preferences.location_scope} onChange={event => setPreferences(current => ({ ...current, location_scope: event.target.value as "regions" | "country" | "worldwide" }))} className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm"><option value="regions">Preferred regions only</option><option value="country">Anywhere in my country</option><option value="worldwide">Worldwide</option></select><span className="mt-1.5 block font-normal leading-5 text-gray-500">Location only excludes roles at this scope; it does not lower a role’s fit score.</span></label>
              <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-gray-600">Country<select value={preferences.preferred_country || ""} onChange={event => setPreferences(current => ({ ...current, preferred_country: event.target.value }))} className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm"><option value="">Résumé location</option><option value="US">United States</option><option value="CA">Canada</option><option value="GB">United Kingdom</option><option value="AU">Australia</option><option value="IN">India</option><option value="IE">Ireland</option><option value="DE">Germany</option><option value="FR">France</option><option value="SG">Singapore</option><option value="JP">Japan</option><option value="BR">Brazil</option><option value="CN">China</option></select></label><label className="text-xs font-semibold text-gray-600">Regions <span className="font-normal text-gray-400">for regional scope</span><input value={preferredRegionsInput} onChange={event => setPreferredRegionsInput(event.target.value)} placeholder="CA, NY, Seattle" className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm" /></label></div>
              <label className="mt-3 flex items-center justify-between text-xs font-semibold text-gray-700"><span>Include remote roles</span><input type="checkbox" checked={preferences.include_remote !== false} onChange={event => setPreferences(current => ({ ...current, include_remote: event.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-indigo-600" /></label>
              <button type="button" onClick={() => void savePreferences(preferences, true)} disabled={savingPreferences || syncing} className="mt-3 h-9 w-full rounded-lg border border-gray-300 bg-gray-50 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50">Save and refresh matches</button>
            </div>
            {recommendedSources.length > 0 && <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
              <div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /><div><p className="text-sm font-semibold text-gray-950">Suggested watch list</p><p className="mt-1 text-xs leading-5 text-gray-600">Review these recommendations first. Nothing is followed until you approve it.</p></div></div>
              <div className="mt-3 space-y-1">{recommendedSources.map(item => {
                const selected = selectedRecommendations.includes(item.sourceId);
                return <button type="button" key={item.sourceId} onClick={() => setSelectedRecommendations(current => selected ? current.filter(id => id !== item.sourceId) : [...current, item.sourceId])} className="flex w-full items-start gap-3 rounded-xl bg-white/80 px-3 py-3 text-left ring-1 ring-indigo-100 transition hover:bg-white"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-300 bg-white"}`}>{selected && <Check className="h-3 w-3" />}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.companyName}</span><span className="mt-0.5 block text-xs leading-5 text-gray-500">{item.reason}</span></span></button>;
              })}</div>
              <button type="button" onClick={approveRecommendedCompanies} disabled={!selectedRecommendations.length || approvingRecommendations} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50">{approvingRecommendations ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{approvingRecommendations ? "Adding companies" : `Approve ${selectedRecommendations.length || "selected"}`}</button>
            </div>}
            <label className="mt-5 flex h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3"><Search className="h-4 w-4 text-gray-400" /><input value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)} placeholder={`Search ${sources.length} verified companies`} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
            <div className="mt-2 flex items-center justify-between px-1 text-xs text-gray-500"><span>{visibleSources.length} companies</span><span>{followedSources.length} followed</span></div>
            <div className="mt-2 space-y-1">{visibleSources.map(source => <button key={source.id} data-source-company={source.company_name} data-subscribed={String(source.subscribed)} onClick={() => toggleSource(source)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white"><span className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold ${source.subscribed ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}>{source.subscribed ? <Check className="h-4 w-4" /> : companyInitials(source.company_name)}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{source.company_name}</span><span className="block truncate text-xs capitalize text-gray-500">{providerLabel(source.provider)} · Last updated: {sourceFreshnessLabel(source)}</span>{source.last_sync_error && <span className="mt-0.5 block truncate text-xs text-rose-600">{source.last_sync_error}</span>}{source.ingestion_task?.status === "failed" && source.ingestion_task.last_error && <span className="mt-0.5 block truncate text-xs text-rose-600">{source.ingestion_task.last_error}</span>}</span><span className={`text-xs font-semibold ${source.subscribed ? "text-indigo-700" : "text-gray-400"}`}>{source.subscribed ? "Following" : "Follow"}</span></button>)}</div>
            <div className="my-6 h-px bg-gray-200" />
            <form onSubmit={findCompany}>
              <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-indigo-600" /><h3 className="font-semibold">Find another company</h3></div>
              <p className="mt-1 text-xs leading-5 text-gray-500">Enter the company. AppliHero will find its official careers source for you to review.</p>
              <label className="mt-4 block text-xs font-semibold text-gray-600">Company name<input required value={companyName} onChange={event => { setCompanyName(event.target.value); setSourceSuggestion(null); }} placeholder="IBM" className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-indigo-500" /></label>
              {!showManualCareerUrl && <button type="button" onClick={() => setShowManualCareerUrl(true)} className="mt-2 text-xs font-semibold text-indigo-700">I know the official careers URL</button>}
              {(showManualCareerUrl || companyDiscoveryFailed || manualCareerUrl) && <label className="mt-3 block text-xs font-semibold text-gray-600">Official careers URL <span className="font-normal text-gray-400">optional fallback</span><input type="url" value={manualCareerUrl} onChange={event => { setManualCareerUrl(event.target.value); setSourceSuggestion(null); }} placeholder="https://company.com/careers" className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-indigo-500" /><span className="mt-1.5 block font-normal leading-5 text-gray-500">AppliHero verifies an ATS feed or structured job posting before adding it.</span></label>}
              <button disabled={discoveringSource || !companyName.trim()} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60">{discoveringSource ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{discoveringSource ? "Finding official source" : "Find company"}</button>
            </form>
            {sourceSuggestion && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">{companyInitials(sourceSuggestion.companyName)}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-gray-950">{sourceSuggestion.companyName}</p><p className="mt-0.5 text-xs capitalize text-gray-600">{providerLabel(sourceSuggestion.provider)} job source</p><a href={sourceSuggestion.careerUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline"><span className="truncate">Review official careers page</span><ExternalLink className="h-3 w-3 shrink-0" /></a></div></div>
              <p className="mt-3 text-xs leading-5 text-gray-600">Does this look like the right company? Confirm it before AppliHero starts monitoring.</p>
              <div className="mt-3 flex gap-2"><button type="button" onClick={() => setSourceSuggestion(null)} className="h-10 flex-1 rounded-xl border border-gray-300 bg-white text-xs font-semibold text-gray-700">Not this one</button><button type="button" onClick={confirmCompany} disabled={savingSource || suggestionAlreadyFollowed} className="inline-flex h-10 flex-[1.35] items-center justify-center gap-2 rounded-xl bg-indigo-600 text-xs font-semibold text-white disabled:opacity-60">{savingSource ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{savingSource ? "Following" : suggestionAlreadyFollowed ? "Already following" : "Confirm and follow"}</button></div>
            </div>}
          </div>
        </aside>
      </div>}
      {showOnboarding && <OnboardingOverlay
        steps={onboardingSteps}
        currentStep={onboardingStep}
        onNext={() => void moveOnboarding(onboardingStep + 1)}
        onPrevious={() => void moveOnboarding(onboardingStep - 1)}
        onSkip={() => void skipDiscoveryOnboarding()}
        onComplete={() => void completeDiscoveryOnboarding()}
      />}
    </div>
  );
}
