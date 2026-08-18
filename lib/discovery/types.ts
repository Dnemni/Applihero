export type JobProvider = "greenhouse" | "lever" | "ashby" | "ibm" | "oracle" | "amazon" | "career_site";
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
  source_updated_at: string | null;
  application_deadline: string | null;
  discovered_at: string;
  last_verified_at: string;
  status: DiscoveryJobStatus;
  parsed_requirements: ParsedRequirement[];
  parser_version: string;
  content_hash: string;
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

export interface DiscoveryJobCard extends Omit<DiscoveryJob, "description_html" | "parsed_requirements"> {
  description_preview: string;
  quickFit: QuickFit;
  application: DiscoveryApplicationState | null;
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
  last_sync_error: string | null;
  sync_interval_minutes: number;
  subscribed: boolean;
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
