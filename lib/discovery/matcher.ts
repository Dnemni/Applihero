import { openai } from "@/lib/supabase/client";
import { extractNormalizedTerms, hashText, parseJobRequirements, REQUIREMENTS_PARSER_VERSION } from "./parser";
import { availabilityQuestionKey, internshipPeriod } from "./facts";
import type {
  DiscoveryJob,
  EligibilityAssessment,
  FitBand,
  JobFitAnalysis,
  ParsedRequirement,
  QuickFit,
  RequirementFit,
} from "./types";

// Increment whenever deterministic eligibility semantics change so stored
// recommendations are recalculated before they are shown again.
export const MATCHER_VERSION = "eligibility-evidence-v23";

const SENSITIVE_CATEGORIES = new Set(["work_authorization", "availability"]);

type ApplicantFacts = {
  graduationYear: number | null;
  graduationEvidence: string | null;
  confirmed: Map<string, string>;
};

function extractApplicantFacts(background: string): ApplicantFacts {
  const lines = background.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const confirmed = new Map<string, string>();
  for (const line of lines) {
    const match = line.match(/^APPLIHERO_CONFIRMED key=([^ ]+) value=([^ ]+)/);
    if (match) confirmed.set(match[1], match[2]);
  }
  const educationRangeLine = lines.find(line =>
    /university|college|bachelor|master/i.test(line) &&
    /\b(?:19|20)\d{2}\b\s*[–—-]\s*(?:[A-Za-z.]+\s+)?\b20\d{2}\b/.test(line)
  );
  const educationRange = educationRangeLine?.match(/\b(?:19|20)\d{2}\b\s*[–—-]\s*(?:[A-Za-z.]+\s+)?\b(20\d{2})\b/);
  if (educationRangeLine && educationRange) {
    return { graduationYear: Number(educationRange[1]), graduationEvidence: educationRangeLine, confirmed };
  }
  const graduationPatterns = [
    /(?:expected|anticipated)(?:\s+graduation|\s+graduate|\s+completion)?[^\n]{0,45}?\b(20\d{2})\b/i,
    /(?:graduat(?:e|ing|ion)|class of)[^\n]{0,45}?\b(20\d{2})\b/i,
    /\b(20\d{2})\b[^\n]{0,45}?(?:expected|anticipated|graduat(?:e|ing|ion)|class of)/i,
  ];

  for (const pattern of graduationPatterns) {
    const line = lines.find(item => pattern.test(item));
    const match = line?.match(pattern);
    if (line && match) return { graduationYear: Number(match[1]), graduationEvidence: line, confirmed };
  }

  return { graduationYear: null, graduationEvidence: null, confirmed };
}

function matchingRequirements(job: DiscoveryJob): ParsedRequirement[] {
  const nonRequirementCopy = /\b(?:you(?:'ll| will) gain hands-on experience|this internship is designed to provide|as an? .{0,80}you(?:'ll| will) gain|to give yourself the best opportunity|you don['’]t need to be an expert|bring your curiosity|we(?:'re| are) building|empower our community|with the support of a dedicated mentor|practice assessments?|interview guides?|invite you to sign up|may redact|date of birth|actual base pay|actual salary offer|top-tier benefits|benefits for full-time employees|job-related factors|market demand|equal employment|equal opportunity|reasonable accommodations?|prohibits discrimination|protected veteran)\b/i;
  const parsed = job.parser_version === REQUIREMENTS_PARSER_VERSION ? (job.parsed_requirements || []) : parseJobRequirements(job.description || "");
  const requirements = parsed
    .filter(requirement => !nonRequirementCopy.test(requirement.text) && !/^\s*\$[\d,.]+(?:\s*(?:&mdash;|[-–—])\s*\$[\d,.]+)?\s*USD\s*$/i.test(requirement.text))
    .map(requirement => {
      const degreeWithoutTiming = requirement.category === "graduation_window" &&
        /\b(?:undergraduate|graduate|bachelor|master|degree)\b/i.test(requirement.text) &&
        !/\b(?:graduation|graduating|class of|graduate (?:in|between|before|after|by)|20\d{2})\b/i.test(requirement.text);
      if (degreeWithoutTiming) return { ...requirement, category: "education" as const };
      if (/\bonsite\b|\bon-site\b|\bbased in an office\b|\bin office\b/i.test(requirement.text)) {
        return { ...requirement, category: "location" as const, needsUserConfirmation: true };
      }
      return requirement;
    });
  const hasGraduationRequirement = requirements.some(item => item.category === "graduation_window");
  const graduateTitle = /\bnew grad(?:uate)?\b|\bgraduate\b/i.test(job.title) && !/\bintern(?:ship)?\b/i.test(job.title);
  if (graduateTitle && !hasGraduationRequirement) {
    const text = "This role is explicitly designated for new graduates, so the applicant's graduation timing must align.";
    requirements.unshift({
      id: `title-${hashText(text).slice(0, 10)}`,
      text,
      sourceQuote: job.title,
      category: "graduation_window",
      priority: "minimum",
      normalizedTerms: [],
      needsUserConfirmation: false,
      confidence: 1,
    });
  }
  const period = internshipPeriod(job.title);
  if (period && /\bintern(?:ship)?|co-?op\b/i.test(job.title) && !requirements.some(item => item.category === "availability")) {
    const text = `The role is scheduled for ${period}.`;
    requirements.push({
      id: `title-${hashText(text).slice(0, 10)}`,
      text,
      sourceQuote: job.title,
      category: "availability",
      priority: "minimum",
      normalizedTerms: [],
      needsUserConfirmation: true,
      confidence: 1,
    });
  }
  return requirements;
}

function graduationFit(requirement: ParsedRequirement, facts: ApplicantFacts, jobTitle: string): RequirementFit | null {
  const requiresReturnToSchool = /return(?:ing)? to (?:school|university|college)|continue academic studies|currently enrolled|(?:semester|schooling|quarter).{0,30}(?:remaining|after)/i.test(requirement.text);
  if (requirement.category !== "graduation_window" && !requiresReturnToSchool) return null;
  if (!facts.graduationYear || !facts.graduationEvidence) {
    return {
      requirement: requirement.text,
      priority: requirement.priority,
      category: requirement.category,
      status: "needs_confirmation",
      evidence: [],
      explanation: "Your graduation date was not found clearly enough to verify this eligibility requirement.",
    };
  }

  const requirementYears = (requirement.text.match(/\b20\d{2}\b/g) || []).map(Number);
  const currentYear = new Date().getFullYear();
  const isNewGrad = (
    /\bnew grad(?:uate)?s?\b/i.test(`${jobTitle} ${requirement.text}`) ||
    (/\bgraduate\b/i.test(jobTitle) && !/\bintern(?:ship)?\b/i.test(jobTitle)) ||
    /\bgraduate (?:role|program|position)\b/i.test(requirement.text)
  );
  let conflictReason = "";

  if (requirementYears.length) {
    const earliest = Math.min(...requirementYears);
    const latest = Math.max(...requirementYears);
    if (facts.graduationYear < earliest || facts.graduationYear > latest) {
      conflictReason = `The role targets a ${earliest === latest ? earliest : `${earliest}–${latest}`} graduation window, while your background says ${facts.graduationYear}.`;
    }
  } else if (isNewGrad && facts.graduationYear > currentYear) {
    conflictReason = `This is a new-graduate role, while your background says you expect to graduate in ${facts.graduationYear}.`;
  }

  if (conflictReason) {
    return {
      requirement: requirement.text,
      priority: requirement.priority,
      category: requirement.category,
      status: "conflicting",
      evidence: [facts.graduationEvidence],
      explanation: conflictReason,
    };
  }

  if (requiresReturnToSchool && facts.graduationYear > currentYear) {
    return {
      requirement: requirement.text,
      priority: requirement.priority,
      category: requirement.category,
      status: "supported",
      evidence: [facts.graduationEvidence],
      explanation: `Your expected ${facts.graduationYear} graduation supports returning to school after a ${currentYear} internship.`,
    };
  }

  if (requirementYears.length || isNewGrad) {
    return {
      requirement: requirement.text,
      priority: requirement.priority,
      category: requirement.category,
      status: "supported",
      evidence: [facts.graduationEvidence],
      explanation: "Your stated graduation timing falls within the role's stated window.",
    };
  }

  return {
    requirement: requirement.text,
    priority: requirement.priority,
    category: requirement.category,
    status: "needs_confirmation",
    evidence: [facts.graduationEvidence],
    explanation: "A graduation date was found, but the posting does not provide a precise window to compare it with.",
  };
}

function bandLabel(band: FitBand): string {
  switch (band) {
    case "strong": return "Strong evidence";
    case "potential": return "Potential fit";
    case "likely_conflict": return "Likely conflict";
    default: return "More information needed";
  }
}

function evidenceForRequirement(requirement: ParsedRequirement, background: string): string[] {
  const lines = background.split(/\n+/).map(line => line.trim()).filter(Boolean);
  if (!requirement.normalizedTerms.length) {
    const lowerRequirement = requirement.text.toLowerCase();
    if (requirement.category === "education") {
      const educationTerms = [
        "bachelor", "master", "phd", "doctorate", "associate", "computer science",
        "engineering", "information systems", "mathematics", "data science",
      ].filter(term => lowerRequirement.includes(term));
      return lines.filter(line => educationTerms.some(term => line.toLowerCase().includes(term))).slice(0, 3);
    }
    if (requirement.category === "graduation_window") {
      const years = lowerRequirement.match(/20\d{2}/g) || [];
      return lines.filter(line => years.some(year => line.includes(year))).slice(0, 3);
    }
    if (requirement.category === "other" && /collaborat|team|feedback|curious|learn|leadership|cross-functional/i.test(requirement.text)) {
      return lines.filter(line => /collaborat|team|co-?found|lead(?:er|ership|ing)?|mentor|partner/i.test(line)).slice(0, 3);
    }
    return [];
  }

  return lines
    .filter(line => {
      const lineTerms = extractNormalizedTerms(line);
      return requirement.normalizedTerms.some(term => lineTerms.includes(term));
    })
    .slice(0, 3);
}

const DEGREE_DISCIPLINES = [
  "electrical engineering", "computer engineering", "mechanical engineering",
  "aerospace engineering", "civil engineering", "chemical engineering",
  "biomedical engineering", "industrial engineering", "materials engineering",
  "computer science", "data science", "information systems", "mathematics", "physics",
] as const;

function degreeDisciplineConflict(requirement: ParsedRequirement, background: string): RequirementFit | null {
  if (requirement.category !== "education" || requirement.priority !== "minimum") return null;
  const required = DEGREE_DISCIPLINES.filter(item => requirement.text.toLowerCase().includes(item));
  if (!required.length || /\b(?:or a )?related (?:field|discipline|degree|area)\b/i.test(requirement.text)) return null;
  const educationLines = background.split(/\n+/).map(line => line.trim()).filter(line =>
    /\b(?:b\.?s\.?|bachelor|master|degree|university|college)\b/i.test(line)
  );
  const applicant = DEGREE_DISCIPLINES.filter(item => educationLines.some(line => line.toLowerCase().includes(item)));
  if (!applicant.length || required.some(item => applicant.includes(item))) return null;
  return {
    requirement: requirement.text,
    priority: requirement.priority,
    category: requirement.category,
    status: "conflicting",
    evidence: educationLines.slice(0, 2),
    explanation: `The role explicitly requires a degree in ${required.join(" or ")}, while your education is in ${applicant.join(" and ")}.`,
  };
}

function deterministicRequirementFit(requirement: ParsedRequirement, background: string, facts: ApplicantFacts, job: Pick<DiscoveryJob, "id" | "title">): RequirementFit {
  const graduation = graduationFit(requirement, facts, job.title);
  if (graduation) return graduation;
  const disciplineConflict = degreeDisciplineConflict(requirement, background);
  if (disciplineConflict) return disciplineConflict;

  if (requirement.category === "work_authorization") {
    const exportControlled = /U\.S\. citizen|U\.S\. national|lawful permanent resident|green card|refugee under|asylee under|ITAR|export control/i.test(requirement.text);
    const value = facts.confirmed.get(exportControlled ? "us_person_export_control" : "work_authorization_us");
    if (exportControlled && value === "meets") return { requirement: requirement.text, priority: requirement.priority, category: requirement.category, status: "supported", evidence: ["Export-control eligibility confirmed by you"], explanation: "Your saved answer supports the posting’s stated U.S.-person requirement." };
    if (exportControlled && value === "does_not_meet") return { requirement: requirement.text, priority: requirement.priority, category: requirement.category, status: "conflicting", evidence: ["Export-control eligibility answer provided by you"], explanation: "Your saved answer directly conflicts with this explicit requirement." };
    const noSponsorship = /(?:no|without|unable to provide|not provide).{0,30}sponsor|sponsorship.{0,30}(?:not available|unavailable)/i.test(requirement.text);
    if (value === "authorized_without_sponsorship") return { requirement: requirement.text, priority: requirement.priority, category: requirement.category, status: "supported", evidence: ["Work authorization confirmed by you"], explanation: "Your saved answer supports this requirement." };
    if (value === "not_authorized" || (value === "authorized_with_future_sponsorship" && noSponsorship)) return { requirement: requirement.text, priority: requirement.priority, category: requirement.category, status: "conflicting", evidence: ["Work authorization answer provided by you"], explanation: "Your saved answer directly conflicts with this requirement." };
  }
  if (requirement.category === "availability") {
    const value = facts.confirmed.get(availabilityQuestionKey(`${job.title} ${requirement.text}`));
    if (value === "yes") return { requirement: requirement.text, priority: requirement.priority, category: requirement.category, status: "supported", evidence: ["Availability confirmed by you"], explanation: "Your saved availability answer supports this requirement." };
    if (value === "no") return { requirement: requirement.text, priority: requirement.priority, category: requirement.category, status: "conflicting", evidence: ["Availability answer provided by you"], explanation: "Your saved availability answer directly conflicts with this requirement." };
  }
  if (requirement.category === "location" || /\bonsite\b|\bon-site\b|\bbased in an office\b|\bin office\b/i.test(requirement.text)) {
    const value = facts.confirmed.get(`location_${job.id}`);
    if (value === "yes") return { requirement: requirement.text, priority: requirement.priority, category: "location", status: "supported", evidence: ["Location availability confirmed by you"], explanation: "Your saved answer confirms that you can meet this work-location requirement." };
    if (value === "no") return { requirement: requirement.text, priority: requirement.priority, category: "location", status: "conflicting", evidence: ["Location availability answer provided by you"], explanation: "Your saved answer directly conflicts with this work-location requirement." };
  }
  if (requirement.needsUserConfirmation || SENSITIVE_CATEGORIES.has(requirement.category)) {
    return {
      requirement: requirement.text,
      priority: requirement.priority,
      category: requirement.category,
      status: "needs_confirmation",
      evidence: [],
      explanation: "This requirement depends on information AppliHero should not infer from your documents.",
    };
  }

  const evidence = evidenceForRequirement(requirement, background);
  if (evidence.length) {
    if (requirement.category === "technical_skill" && requirement.normalizedTerms.length) {
      const backgroundTerms = new Set(extractNormalizedTerms(background));
      const matchedTerms = requirement.normalizedTerms.filter(term => backgroundTerms.has(term));
      const allowsAnyNamedSkill = /one or more|at least one|any (?:one )?of/i.test(requirement.text);
      const fullySupported = allowsAnyNamedSkill ? matchedTerms.length > 0 : matchedTerms.length === requirement.normalizedTerms.length;
      return {
        requirement: requirement.text,
        priority: requirement.priority,
        category: requirement.category,
        status: fullySupported ? "supported" : "partially_supported",
        evidence,
        explanation: fullySupported
          ? `Your background directly shows ${matchedTerms.join(", ")}.`
          : `Your background shows ${matchedTerms.join(", ")}, but not every named technology is evidenced.`,
      };
    }
    return {
      requirement: requirement.text,
      priority: requirement.priority,
      category: requirement.category,
      status: "supported",
      evidence,
      explanation: "Your uploaded background contains direct terminology related to this requirement.",
    };
  }

  return {
    requirement: requirement.text,
    priority: requirement.priority,
    category: requirement.category,
    status: "not_evidenced",
    evidence: [],
    explanation: "No direct supporting evidence was found in the uploaded background. This is not proof that you lack the qualification.",
  };
}

function requiresExplicitEvidence(requirement: RequirementFit) {
  if (requirement.priority !== "minimum") return false;
  const text = requirement.requirement.toLowerCase();
  if (requirement.category === "education") return /\b(?:must|required|currently pursuing|bachelor|master|ph\.?d|degree)\b/.test(text);
  if (requirement.category === "technical_skill") return /\b(?:must|required|minimum qualification|proficient|expertise in|strong experience)\b/.test(text);
  if (requirement.category === "experience" || requirement.category === "domain_experience") {
    return /\b(?:must|required|minimum qualification|at least|\d+\+?\s*(?:years?|yrs?))\b/.test(text);
  }
  return false;
}

function summarizeRequirements(requirements: RequirementFit[]) {
  let supportedCount = 0;
  let conflicts = 0;

  for (const requirement of requirements) {
    if (requirement.status === "supported") {
      supportedCount += 1;
    } else if (requirement.status === "conflicting") {
      conflicts += 1;
    }
  }

  const hardEligibilityCategories = ["graduation_window", "education", "location", "work_authorization", "availability"];
  // An absent résumé quote is usually an evidence gap, not a contradiction.
  // Treat it as disqualifying only when the posting itself makes the evidence
  // an explicit, non-negotiable requirement. Direct factual contradictions
  // (for example, degree discipline or graduation timing) remain hard stops.
  const hardConflicts = requirements.filter(requirement =>
    requirement.priority === "minimum" && (
      (requirement.status === "conflicting" && hardEligibilityCategories.includes(requirement.category)) ||
      (requirement.status === "not_evidenced" && requiresExplicitEvidence(requirement))
    )
  );
  const minimums = requirements.filter(requirement => requirement.priority === "minimum" && requirement.status !== "needs_confirmation");
  // Lack of a résumé quote is uncertainty, not a failed requirement. Keep
  // hard/technical requirements influential while preventing generic traits
  // from burying a role that otherwise fits.
  const value = (requirement: RequirementFit) => requirement.status === "supported" ? 1 : requirement.status === "partially_supported" ? 0.72 : requirement.status === "not_evidenced" ? 0.58 : 0;
  const weight = (requirement: RequirementFit) => {
    if (["education", "graduation_window", "work_authorization", "location", "availability"].includes(requirement.category)) return 1.25;
    if (requirement.category === "technical_skill") return 1.15;
    if (requirement.category === "experience" || requirement.category === "domain_experience") return 0.9;
    return 0.45;
  };
  // Preferred qualifications can strengthen a fit, but their absence should
  // not make an otherwise eligible internship look unsuitable.
  const preferredEvidence = requirements.filter(requirement => requirement.priority === "preferred")
    .reduce((total, requirement) => total + (requirement.status === "supported" ? 1 : requirement.status === "partially_supported" ? 0.5 : 0), 0);
  const minimumWeight = minimums.reduce((total, requirement) => total + weight(requirement), 0);
  let score = minimumWeight
    ? Math.round((minimums.reduce((total, requirement) => total + value(requirement) * weight(requirement), 0) / minimumWeight) * 85 + Math.min(15, preferredEvidence * 5))
    : null;
  if (score !== null && hardConflicts.length) score = 0;
  // A tiny extracted requirement set cannot justify a near-certain score even
  // when every extracted item has evidence. Keep the result explicitly
  // provisional until the parser has broader coverage of the posting.
  score = score === null ? null : Math.max(0, Math.min(100, score));
  let band: FitBand = "needs_information";
  if (conflicts > 0 || hardConflicts.length > 0) band = "likely_conflict";
  else if (score !== null && score >= 75) band = "strong";
  else if (score !== null && score >= 45) band = "potential";

  return { score, band, supportedCount, hardConflicts };
}

function eligibilityAssessment(requirements: RequirementFit[]): EligibilityAssessment {
  const conflicts = requirements.filter(item => item.priority === "minimum" && (
    item.status === "conflicting" ||
    (item.status === "not_evidenced" && requiresExplicitEvidence(item))
  ));
  if (conflicts.length) {
    return {
      status: "conflict",
      label: "Eligibility conflict",
      reasons: conflicts.map(item => item.status === "not_evidenced"
        ? `Your supplied background does not evidence the explicit minimum requirement: ${item.requirement}`
        : item.explanation
      ).slice(0, 2),
    };
  }
  const unknowns = requirements.filter(item =>
    item.priority === "minimum" &&
    item.status === "needs_confirmation" &&
    ["graduation_window", "education", "location", "work_authorization", "availability"].includes(item.category)
  );
  if (unknowns.length) {
    return {
      status: "unknown",
      label: "Eligibility needs confirmation",
      reasons: unknowns.map(item => item.explanation).slice(0, 2),
    };
  }
  return {
    status: "aligned",
    label: "Eligibility appears aligned",
    reasons: ["No explicit conflict was found in the eligibility information supplied."],
  };
}

export function buildQuickFit(job: DiscoveryJob, background: string): QuickFit {
  const requirements = matchingRequirements(job);
  if (!background.trim()) {
    return {
      matcherVersion: MATCHER_VERSION,
      source: "deterministic",
      score: null,
      band: "needs_information",
      label: bandLabel("needs_information"),
      reasons: ["Upload a résumé to see evidence-based fit information."],
      supportedCount: 0,
      requirementCount: requirements.length,
      eligibility: { status: "unknown", label: "Eligibility unknown", reasons: ["Add your résumé or profile details to check eligibility."] },
    };
  }

  const facts = extractApplicantFacts(background);
  const matches = requirements.map(requirement => deterministicRequirementFit(requirement, background, facts, job));
  const { score, band, supportedCount } = summarizeRequirements(matches);
  const supportedTerms = requirements
    .filter((_, index) => matches[index].status === "supported")
    .flatMap(requirement => requirement.normalizedTerms)
    .slice(0, 3);
  const needsConfirmation = matches.filter(match => match.status === "needs_confirmation").length;
  const reasons: string[] = [];
  if (supportedTerms.length) reasons.push(`Evidence found for ${Array.from(new Set(supportedTerms)).join(", ")}.`);
  if (needsConfirmation) reasons.push(`${needsConfirmation} requirement${needsConfirmation === 1 ? " needs" : "s need"} your confirmation.`);
  if (!reasons.length) reasons.push("The résumé has limited direct overlap with the extracted requirements.");

  return {
    matcherVersion: MATCHER_VERSION,
    source: "deterministic",
    score,
    band,
    label: bandLabel(band),
    reasons,
    supportedCount,
    requirementCount: requirements.length,
    eligibility: eligibilityAssessment(matches),
  };
}

function buildDeterministicAnalysis(job: DiscoveryJob, background: string): JobFitAnalysis {
  const facts = extractApplicantFacts(background);
  const requirements = matchingRequirements(job).map(requirement => deterministicRequirementFit(requirement, background, facts, job));
  const canonical = buildQuickFit(job, background);
  const supported = requirements.filter(item => item.status === "supported");
  const missing = requirements.filter(item => item.status === "not_evidenced");
  const unclear = requirements.filter(item => item.status === "needs_confirmation");
  const roleSummary = [job.title, job.company_name, job.location, job.workplace_type, job.employment_type]
    .filter(Boolean)
    .join(" · ");
  const applicantEvidence = supported.map(item => item.evidence[0]).filter(Boolean).slice(0, 3);
  const applicantSummary = applicantEvidence.length
    ? `Your supplied background directly supports this match with ${applicantEvidence.join("; ")}.`
    : "Your supplied background does not yet show enough direct evidence to summarize a strong connection to this role.";
  const fitSummary = canonical.band === "likely_conflict"
    ? "At least one explicit minimum requirement conflicts with the information currently on file."
    : canonical.band === "strong"
      ? "Your documented background covers most of the role's extracted requirements without an explicit eligibility conflict."
      : canonical.band === "potential"
        ? "There is relevant overlap, but some important requirements are missing or need confirmation."
        : "More applicant information is needed before this role can be assessed confidently.";
  const recommendation = canonical.band === "strong"
    ? { priority: "high" as const, verdict: "apply" as const, label: "High priority — apply", rationale: "The documented evidence is strong enough to justify prioritizing an application, assuming any remaining eligibility questions are confirmed." }
    : canonical.band === "potential"
      ? { priority: "medium" as const, verdict: "consider" as const, label: "Medium priority — consider applying", rationale: "The role has meaningful overlap, but confirm the open requirements before investing heavily in the application." }
      : canonical.band === "likely_conflict"
        ? { priority: "low" as const, verdict: "skip" as const, label: "Low priority — likely skip", rationale: "An explicit minimum requirement appears to conflict with the information currently supplied." }
        : { priority: "low" as const, verdict: "consider" as const, label: "More information needed", rationale: "Answer the outstanding eligibility questions before deciding whether this role deserves application time." };

  return {
    score: canonical.score,
    band: canonical.band,
    label: canonical.label,
    summary: requirements.length
      ? "This preliminary analysis compares extracted job requirements with direct terminology in your uploaded background."
      : "The posting did not contain enough clearly extractable requirements for a dependable comparison.",
    roleSummary,
    applicantSummary,
    fitSummary,
    recommendation,
    requirements,
    strengths: supported.slice(0, 4).map(item => ({
      title: item.requirement,
      evidence: item.evidence[0] || "Direct terminology appears in your background.",
    })),
    gaps: [
      ...missing.slice(0, 4).map(item => ({
        title: item.requirement,
        kind: "missing" as const,
        action: "Confirm whether you have relevant experience, then represent it accurately if supported.",
      })),
      ...unclear.slice(0, 3).map(item => ({
        title: item.requirement,
        kind: "unclear" as const,
        action: "Answer this requirement manually; AppliHero will not infer it.",
      })),
    ],
    keywordAlignment: {
      present: Array.from(new Set(supported.flatMap(item => extractNormalizedTerms(item.requirement)))).slice(0, 12),
      absent: Array.from(new Set(missing.flatMap(item => extractNormalizedTerms(item.requirement)))).slice(0, 12),
    },
    coachingActions: missing.slice(0, 3).map(item => `Review whether your real experience supports: ${item.requirement}`),
    limitations: ["This fallback uses direct terminology matching and may miss transferable or indirectly stated experience."],
    generatedBy: "deterministic",
    eligibility: canonical.eligibility,
  };
}

const FIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "band", "label", "summary", "roleSummary", "applicantSummary", "fitSummary", "recommendation", "requirements", "strengths", "gaps", "keywordAlignment", "coachingActions", "limitations"],
  properties: {
    score: { anyOf: [{ type: "integer", minimum: 0, maximum: 100 }, { type: "null" }] },
    band: { type: "string", enum: ["strong", "potential", "needs_information", "likely_conflict"] },
    label: { type: "string" },
    summary: { type: "string" },
    roleSummary: { type: "string" },
    applicantSummary: { type: "string" },
    fitSummary: { type: "string" },
    recommendation: {
      type: "object",
      additionalProperties: false,
      required: ["priority", "verdict", "label", "rationale"],
      properties: {
        priority: { type: "string", enum: ["high", "medium", "low"] },
        verdict: { type: "string", enum: ["apply", "consider", "skip"] },
        label: { type: "string" },
        rationale: { type: "string" },
      },
    },
    requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["requirement", "priority", "category", "status", "evidence", "explanation"],
        properties: {
          requirement: { type: "string" },
          priority: { type: "string", enum: ["minimum", "preferred"] },
          category: { type: "string", enum: ["education", "graduation_window", "experience", "technical_skill", "domain_experience", "location", "work_authorization", "availability", "other"] },
          status: { type: "string", enum: ["supported", "partially_supported", "not_evidenced", "conflicting", "needs_confirmation"] },
          evidence: { type: "array", items: { type: "string" } },
          explanation: { type: "string" },
        },
      },
    },
    strengths: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "evidence"],
        properties: { title: { type: "string" }, evidence: { type: "string" } },
      },
    },
    gaps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "kind", "action"],
        properties: {
          title: { type: "string" },
          kind: { type: "string", enum: ["missing", "unclear", "conflict"] },
          action: { type: "string" },
        },
      },
    },
    keywordAlignment: {
      type: "object",
      additionalProperties: false,
      required: ["present", "absent"],
      properties: {
        present: { type: "array", items: { type: "string" } },
        absent: { type: "array", items: { type: "string" } },
      },
    },
    coachingActions: { type: "array", items: { type: "string" } },
    limitations: { type: "array", items: { type: "string" } },
  },
} as const;

function evidenceIsGrounded(quote: string, background: string): boolean {
  const normalizedQuote = quote.toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedBackground = background.toLowerCase().replace(/\s+/g, " ");
  return normalizedQuote.length >= 4 && normalizedBackground.includes(normalizedQuote);
}

function validateAnalysis(result: JobFitAnalysis, background: string, job: DiscoveryJob): JobFitAnalysis {
  const facts = extractApplicantFacts(background);
  const sourceRequirements = matchingRequirements(job);
  const sourceRequirementText = new Set(sourceRequirements.map(item => item.text));
  // The model evaluates parser output; it is not allowed to create new
  // requirements from responsibilities, dates, or general posting copy.
  let requirements = result.requirements.filter(item => sourceRequirementText.has(item.requirement)).map(item => {
    const evidence = item.evidence.filter(quote => evidenceIsGrounded(quote, background));
    if ((item.status === "supported" || item.status === "partially_supported" || item.status === "conflicting") && evidence.length === 0) {
      const source = sourceRequirements.find(requirement => requirement.text === item.requirement);
      const fallback = source ? deterministicRequirementFit(source, background, facts, job) : null;
      if (fallback && (fallback.status === "supported" || fallback.status === "partially_supported" || fallback.status === "conflicting")) {
        return fallback;
      }
      return {
        ...item,
        status: "not_evidenced" as const,
        evidence: [],
        explanation: "The generated evidence could not be verified against your uploaded background.",
      };
    }
    return { ...item, evidence };
  });

  for (const source of sourceRequirements) {
    if (!requirements.some(item => item.requirement === source.text)) {
      requirements.push(deterministicRequirementFit(source, background, facts, job));
    }
  }

  const enforcedRequirements = sourceRequirements
    .filter(item => item.category === "education" || item.category === "graduation_window" || SENSITIVE_CATEGORIES.has(item.category) || /return(?:ing)? to (?:school|university|college)|continue academic studies|currently enrolled/i.test(item.text))
    .map(item => deterministicRequirementFit(item, background, facts, job));

  for (const enforced of enforcedRequirements) {
    const index = requirements.findIndex(item => item.requirement === enforced.requirement);
    if (index >= 0) requirements[index] = enforced;
    else requirements.unshift(enforced);
  }

  const canonical = summarizeRequirements(requirements);
  const eligibility = eligibilityAssessment(requirements);
  const graduationConflict = requirements.some(item => item.category === "graduation_window" && item.status === "conflicting");
  const recommendation = eligibility.status === "conflict"
    ? { priority: "low" as const, verdict: "skip" as const, label: "Low priority — likely skip", rationale: "An explicit minimum requirement conflicts with the information currently supplied." }
    : canonical.band === "strong"
      ? { priority: "high" as const, verdict: "apply" as const, label: "High priority — apply", rationale: "The documented evidence is strong enough to prioritize an application after confirming any remaining eligibility questions." }
      : canonical.band === "potential"
        ? { priority: "medium" as const, verdict: "consider" as const, label: "Medium priority — consider applying", rationale: "There is meaningful overlap, but the remaining gaps should be reviewed before investing heavily in tailoring." }
        : { priority: "low" as const, verdict: "consider" as const, label: "More information needed", rationale: "Resolve the open eligibility questions and evidence gaps before deciding how much application time to invest." };
  const unsupportedConflictNarrative = eligibility.status !== "conflict" && /\b(?:conflict|ineligible|not eligible)\b/i.test(`${result.fitSummary} ${result.recommendation.label} ${result.recommendation.rationale}`);
  const supportedCount = requirements.filter(item => item.status === "supported" || item.status === "partially_supported").length;
  const evidenceGapCount = requirements.filter(item => item.status === "not_evidenced").length;
  const canonicalFitSummary = eligibility.status === "conflict"
    ? `This role is low priority: ${eligibility.reasons.join(" ")} Transferable skills can help with preferred qualifications, but they do not replace an explicit minimum requirement.`
    : `No explicit eligibility conflict was found. Your supplied background supports ${supportedCount} of ${requirements.length} extracted requirements${evidenceGapCount ? `, while ${evidenceGapCount} are not yet evidenced in your profile` : ""}.`;
  return {
    ...result,
    score: canonical.score,
    band: canonical.band,
    label: bandLabel(canonical.band),
    recommendation,
    fitSummary: eligibility.status === "conflict" || unsupportedConflictNarrative ? canonicalFitSummary : result.fitSummary,
    gaps: result.gaps.filter(gap => graduationConflict || !/graduat/i.test(gap.title)),
    coachingActions: result.coachingActions.filter(action => graduationConflict || !/graduat|ineligib|eligibility conflict/i.test(action)),
    requirements,
    generatedBy: "ai",
    eligibility,
  };
}

export function quickFitFromAnalysis(
  analysis: JobFitAnalysis,
  profileHash: string,
  jobHash: string,
): QuickFit {
  return {
    matcherVersion: MATCHER_VERSION,
    evaluatedProfileHash: profileHash,
    evaluatedJobHash: jobHash,
    source: "analysis",
    score: analysis.score,
    band: analysis.band,
    label: analysis.label,
    reasons: [analysis.fitSummary || analysis.summary].filter(Boolean),
    supportedCount: analysis.requirements.filter(item => item.status === "supported").length,
    requirementCount: analysis.requirements.length,
    eligibility: analysis.eligibility,
  };
}

export async function analyzeJobFit(job: DiscoveryJob, background: string): Promise<JobFitAnalysis> {
  if (!background.trim() || !(job.parsed_requirements || []).length) {
    return buildDeterministicAnalysis(job, background);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: { name: "job_fit_analysis", strict: true, schema: FIT_SCHEMA },
      },
      messages: [
        {
          role: "system",
          content: `You are AppliHero's evidence-based application coach. Compare the job requirements with the applicant's real uploaded background.

Rules:
- Evaluate every supplied job requirement and preserve whether it is minimum or preferred.
- Copy each requirement string exactly from EXTRACTED REQUIREMENTS. Never create, paraphrase, split, or merge requirements from other posting copy.
- Cite only exact, short quotes copied from APPLICANT BACKGROUND. Never invent, paraphrase, or upgrade evidence.
- "Not evidenced" means the documents do not show it; it does not mean the applicant lacks it.
- Use "needs_confirmation" for work authorization, sponsorship, availability, relocation, or anything the supplied background cannot establish. Lines beginning APPLIHERO_CONFIRMED are explicit dated answers from the user and may be used as facts.
- Use "conflicting" only when an explicit applicant fact directly contradicts an explicit minimum requirement.
- Graduation dates and other eligibility facts are hard constraints. Never treat unrelated skills as compensation for an explicit eligibility conflict.
- A new-graduate role conflicts with an applicant who explicitly graduates in a later year unless the posting states that later year is eligible.
- An internship taking place before the applicant graduates is normal. If the applicant graduates after the internship and the posting requires returning to school, treat that timing as supported—not a conflict. Never say an internship must begin after graduation.
- Do not infer protected or sensitive characteristics.
- The score measures documented evidence coverage, not hiring probability or personal worth.
- Minimum requirements carry more weight than preferred requirements.
- Give coaching actions that help the user verify or present real experience; do not fabricate qualifications.
- Write a practical decision brief, not generic encouragement. roleSummary must cover the role's work, team or domain, location/work arrangement, timing, and notable responsibilities or qualifications when stated.
- applicantSummary must capture the applicant's most relevant education, graduation timing, experience, projects, leadership, and skills that are actually present in the supplied background. Do not add facts.
- fitSummary must explain the most important connections, gaps, and unknowns in plain language.
- recommendation must say whether this is worth applying to and assign high, medium, or low priority. Explicit eligibility conflicts should normally be low/skip; unanswered eligibility questions alone should not make an otherwise strong match low priority.
- Keep each summary focused and specific. Prefer concrete job and applicant details over score commentary.`,
        },
        {
          role: "user",
          content: `JOB
Title: ${job.title}
Company: ${job.company_name}
Location: ${job.location || "Not provided"}
Workplace: ${job.workplace_type || "Not provided"}
Employment type: ${job.employment_type || "Not provided"}
Posted: ${job.source_published_at || "Not provided"}
Deadline: ${job.application_deadline || "Not provided"}

JOB DESCRIPTION
${job.description.slice(0, 18000)}

EXTRACTED REQUIREMENTS
${JSON.stringify(matchingRequirements(job), null, 2)}

APPLICANT BACKGROUND
${background.slice(0, 24000)}`,
        },
      ],
    } as any);

    const content = completion.choices[0]?.message?.content;
    if (!content) return buildDeterministicAnalysis(job, background);
    return validateAnalysis({ ...JSON.parse(content), generatedBy: "ai" } as JobFitAnalysis, background, job);
  } catch (error) {
    console.error("Evidence fit analysis fell back to deterministic matching:", error);
    return buildDeterministicAnalysis(job, background);
  }
}
