export type JobProvider = "greenhouse" | "lever" | "ashby" | "career_site";
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
}
