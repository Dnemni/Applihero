export type JobProvider = "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters" | "workday" | "eightfold" | "jibe" | "ibm" | "oracle" | "successfactors" | "amazon" | "avature" | "indexed_site" | "career_site";
export type DiscoveryJobStatus = "open" | "unverified" | "closed";
export type RequirementPriority = "minimum" | "preferred";
export type RequirementCategory =
  | "education"
  | "graduation_window"
  | "experience"
  | "technical_skill"
  | "domain_experience"
  | "location"
  | "work_authorization"
  | "availability"
  | "other";

export type RequirementMatchStatus =
  | "supported"
  | "partially_supported"
  | "not_evidenced"
  | "conflicting"
  | "needs_confirmation";

export interface ParsedRequirement {
  id: string;
  text: string;
  sourceQuote: string;
  category: RequirementCategory;
  priority: RequirementPriority;
  normalizedTerms: string[];
  needsUserConfirmation: boolean;
  confidence: number;
}

export interface DiscoveryJob {
  id: string;
  source_id: string;
  source_job_id: string;
  company_name: string;
  title: string;
  description: string;
  description_html: string | null;
  location: string | null;
  workplace_type: string | null;
  employment_type: string | null;
  departments: string[];
  source_url: string;
  apply_url: string;
  source_published_at: string | null;
  source_published_precision?: "instant" | "day" | "relative_day" | "unknown";
  source_published_source?: string | null;
  source_updated_at: string | null;
  application_deadline: string | null;
  discovered_at: string;
  first_seen_at?: string;
  last_seen_at?: string;
  bootstrap_observed?: boolean;
  enrichment_status?: "pending" | "processing" | "complete" | "failed";
  last_verified_at: string;
  status: DiscoveryJobStatus;
  parsed_requirements: ParsedRequirement[];
  parser_version: string;
  content_hash: string;
  content_storage?: "supabase" | "r2";
  content_ref?: string | null;
  content_stored_at?: string | null;
  content_bytes?: number | null;
  job_sources?: {
    provider: JobProvider;
    company_name: string;
    external_key: string;
  } | null;
}

export type FitBand = "strong" | "potential" | "needs_information" | "likely_conflict";

export type EligibilityStatus = "aligned" | "unknown" | "conflict";

export interface EligibilityAssessment {
  status: EligibilityStatus;
  label: string;
  reasons: string[];
}

export interface QuickFit {
  matcherVersion?: string;
  evaluatedProfileHash?: string;
  evaluatedJobHash?: string;
  discoveryEligible?: boolean;
  discoveryEligibilityReason?: string;
  source?: "deterministic" | "analysis";
  score: number | null;
  band: FitBand;
  label: string;
  reasons: string[];
  supportedCount: number;
  requirementCount: number;
  eligibility: EligibilityAssessment;
}

export interface RequirementFit {
  requirement: string;
  priority: RequirementPriority;
  category: RequirementCategory;
  status: RequirementMatchStatus;
  evidence: string[];
  explanation: string;
}

export interface JobFitAnalysis {
  score: number | null;
  band: FitBand;
  label: string;
  summary: string;
  roleSummary: string;
  applicantSummary: string;
  fitSummary: string;
  recommendation: {
    priority: "high" | "medium" | "low";
    verdict: "apply" | "consider" | "skip";
    label: string;
    rationale: string;
  };
  requirements: RequirementFit[];
  strengths: Array<{ title: string; evidence: string }>;
  gaps: Array<{
    title: string;
    kind: "missing" | "unclear" | "conflict";
    action: string;
  }>;
  keywordAlignment: {
    present: string[];
    absent: string[];
  };
  coachingActions: string[];
  limitations: string[];
  generatedBy: "ai" | "deterministic";
  eligibility: EligibilityAssessment;
}

export type DiscoveryFitState = "current" | "stale" | "catalog";

export interface DiscoveryJobCard extends Omit<DiscoveryJob, "description_html" | "parsed_requirements"> {
  description_preview?: string;
  quickFit: QuickFit;
  /** `stale` means the stored score predates the current profile, posting, or matcher; `catalog` means the role was never scored for this user. */
  fitState: DiscoveryFitState;
  application: DiscoveryApplicationState | null;
}

export interface DiscoveryFeedResponse {
  jobs: DiscoveryJobCard[];
  scope: "matches" | "all";
  totalResults: number;
  totalIsEstimate?: boolean;
  strongResults: number;
  staleMatches: number;
  offset: number;
  nextOffset: number | null;
  hasBackground: boolean;
  hasSubscriptions: boolean;
}

export interface DiscoveryApplicationState {
  id: string;
  status: "Draft" | "In Progress" | "Submitted" | "Archived";
  lastTouchedAt: string;
}

export interface DiscoverySource {
  id: string;
  provider: JobProvider;
  external_key: string;
  company_name: string;
  career_url: string | null;
  enabled: boolean;
  featured?: boolean;
  last_sync_completed_at: string | null;
  last_successful_scan_at?: string | null;
  next_sync_at?: string | null;
  last_sync_error: string | null;
  sync_interval_minutes: number;
  subscribed: boolean;
  ingestion_task?: {
    status: "queued" | "running" | "retry_wait" | "failed";
    scheduled_for: string;
    available_at: string;
    lease_expires_at: string | null;
    last_error: string | null;
  } | null;
}

export interface DiscoverySourceSuggestion {
  companyName: string;
  provider: JobProvider;
  externalKey: string;
  careerUrl: string;
  existingSourceId?: string;
}

export interface DiscoverySourceRecommendation {
  sourceId: string;
  companyName: string;
  reason: string;
  bestScore: number | null;
}

export interface DiscoveryNotification {
  id: string;
  kind: "job_matches" | "source_error";
  title: string;
  body: string;
  job_ids: string[];
  read_at: string | null;
  created_at: string;
}
