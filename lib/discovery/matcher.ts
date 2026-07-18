import { openai } from "@/lib/supabase/client";
import { extractNormalizedTerms, hashText } from "./parser";
import type {
  DiscoveryJob,
  EligibilityAssessment,
  FitBand,
  JobFitAnalysis,
  ParsedRequirement,
  QuickFit,
  RequirementFit,
} from "./types";

export const MATCHER_VERSION = "eligibility-evidence-v4";

const SENSITIVE_CATEGORIES = new Set(["work_authorization", "availability"]);

type ApplicantFacts = {
  graduationYear: number | null;
  graduationEvidence: string | null;
};

function extractApplicantFacts(background: string): ApplicantFacts {
  const lines = background.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const graduationPatterns = [
    /(?:expected|anticipated)(?:\s+graduation|\s+graduate|\s+completion)?[^\n]{0,45}?\b(20\d{2})\b/i,
    /(?:graduat(?:e|ing|ion)|class of)[^\n]{0,45}?\b(20\d{2})\b/i,
    /\b(20\d{2})\b[^\n]{0,45}?(?:expected|anticipated|graduat(?:e|ing|ion)|class of)/i,
  ];

  for (const pattern of graduationPatterns) {
    const line = lines.find(item => pattern.test(item));
    const match = line?.match(pattern);
    if (line && match) return { graduationYear: Number(match[1]), graduationEvidence: line };
  }

  return { graduationYear: null, graduationEvidence: null };
}

function matchingRequirements(job: DiscoveryJob): ParsedRequirement[] {
  const requirements = [...(job.parsed_requirements || [])];
  const hasGraduationRequirement = requirements.some(item => item.category === "graduation_window");
  if (/\b(?:new grad|new graduate|graduate (?:role|program|position))\b/i.test(job.title) && !hasGraduationRequirement) {
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
  return requirements;
}

function graduationFit(requirement: ParsedRequirement, facts: ApplicantFacts, jobTitle: string): RequirementFit | null {
  if (requirement.category !== "graduation_window") return null;
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
  const isNewGrad = /\b(?:new grad|new graduate|graduate (?:role|program|position))\b/i.test(`${jobTitle} ${requirement.text}`);
  const requiresReturnToSchool = /return(?:ing)? to (?:school|university|college)|currently enrolled/i.test(requirement.text);
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
    return [];
  }

  return lines
    .filter(line => {
      const lineTerms = extractNormalizedTerms(line);
      return requirement.normalizedTerms.some(term => lineTerms.includes(term));
    })
    .slice(0, 3);
}

function deterministicRequirementFit(requirement: ParsedRequirement, background: string, facts: ApplicantFacts, jobTitle: string): RequirementFit {
  const graduation = graduationFit(requirement, facts, jobTitle);
  if (graduation) return graduation;

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
      const fullySupported = matchedTerms.length === requirement.normalizedTerms.length;
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

function summarizeRequirements(requirements: RequirementFit[]) {
  let earned = 0;
  let possible = 0;
  let supportedCount = 0;
  let unresolvedMinimums = 0;
  let conflicts = 0;

  for (const requirement of requirements) {
    const weight = requirement.priority === "minimum" ? 3 : 1;
    possible += weight;
    if (requirement.status === "supported") {
      earned += weight;
      supportedCount += 1;
    } else if (requirement.status === "partially_supported") {
      earned += weight * 0.5;
    } else if (requirement.status === "conflicting") {
      conflicts += 1;
    } else if (requirement.priority === "minimum" && requirement.status === "needs_confirmation") {
      unresolvedMinimums += 1;
    }
  }

  const hardConflicts = requirements.filter(requirement =>
    requirement.priority === "minimum" &&
    requirement.status === "conflicting" &&
    ["graduation_window", "education", "location"].includes(requirement.category)
  );
  let score = possible ? Math.round((earned / possible) * 100) : null;
  if (score !== null && hardConflicts.length) score = Math.min(score, 5);
  let band: FitBand = "needs_information";
  if (conflicts > 0) band = "likely_conflict";
  else if (score !== null && score >= 75 && unresolvedMinimums <= 1) band = "strong";
  else if (score !== null && score >= 45) band = "potential";

  return { score, band, supportedCount, hardConflicts };
}

function eligibilityAssessment(requirements: RequirementFit[]): EligibilityAssessment {
  const conflicts = requirements.filter(item => item.priority === "minimum" && item.status === "conflicting");
  if (conflicts.length) {
    return {
      status: "conflict",
      label: "Eligibility conflict",
      reasons: conflicts.map(item => item.explanation).slice(0, 2),
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
  const matches = requirements.map(requirement => deterministicRequirementFit(requirement, background, facts, job.title));
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
  const requirements = matchingRequirements(job).map(requirement => deterministicRequirementFit(requirement, background, facts, job.title));
  const canonical = buildQuickFit(job, background);
  const supported = requirements.filter(item => item.status === "supported");
  const missing = requirements.filter(item => item.status === "not_evidenced");
  const unclear = requirements.filter(item => item.status === "needs_confirmation");

  return {
    score: canonical.score,
    band: canonical.band,
    label: canonical.label,
    summary: requirements.length
      ? "This preliminary analysis compares extracted job requirements with direct terminology in your uploaded background."
      : "The posting did not contain enough clearly extractable requirements for a dependable comparison.",
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
  required: ["score", "band", "label", "summary", "requirements", "strengths", "gaps", "keywordAlignment", "coachingActions", "limitations"],
  properties: {
    score: { anyOf: [{ type: "integer", minimum: 0, maximum: 100 }, { type: "null" }] },
    band: { type: "string", enum: ["strong", "potential", "needs_information", "likely_conflict"] },
    label: { type: "string" },
    summary: { type: "string" },
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
  let requirements = result.requirements.map(item => {
    const evidence = item.evidence.filter(quote => evidenceIsGrounded(quote, background));
    if ((item.status === "supported" || item.status === "partially_supported") && evidence.length === 0) {
      const source = sourceRequirements.find(requirement => requirement.text === item.requirement);
      const fallback = source ? deterministicRequirementFit(source, background, facts, job.title) : null;
      if (fallback && (fallback.status === "supported" || fallback.status === "partially_supported")) {
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

  const graduationRequirements = sourceRequirements
    .filter(item => item.category === "graduation_window")
    .map(item => graduationFit(item, facts, job.title))
    .filter((item): item is RequirementFit => Boolean(item));

  for (const enforced of graduationRequirements) {
    const index = requirements.findIndex(item => item.requirement === enforced.requirement);
    if (index >= 0) requirements[index] = enforced;
    else requirements.unshift(enforced);
  }

  const canonical = buildQuickFit(job, background);
  return {
    ...result,
    score: canonical.score,
    band: canonical.band,
    label: canonical.label,
    requirements,
    generatedBy: "ai",
    eligibility: canonical.eligibility,
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
- Cite only exact, short quotes copied from APPLICANT BACKGROUND. Never invent, paraphrase, or upgrade evidence.
- "Not evidenced" means the documents do not show it; it does not mean the applicant lacks it.
- Use "needs_confirmation" for work authorization, sponsorship, availability, relocation, or anything the documents cannot safely establish.
- Use "conflicting" only when an explicit applicant fact directly contradicts an explicit minimum requirement.
- Graduation dates and other eligibility facts are hard constraints. Never treat unrelated skills as compensation for an explicit eligibility conflict.
- A new-graduate role conflicts with an applicant who explicitly graduates in a later year unless the posting states that later year is eligible.
- Do not infer protected or sensitive characteristics.
- The score measures documented evidence coverage, not hiring probability or personal worth.
- Minimum requirements carry more weight than preferred requirements.
- Give coaching actions that help the user verify or present real experience; do not fabricate qualifications.`,
        },
        {
          role: "user",
          content: `JOB
Title: ${job.title}
Company: ${job.company_name}

EXTRACTED REQUIREMENTS
${JSON.stringify(matchingRequirements(job), null, 2)}

APPLICANT BACKGROUND
${background.slice(0, 30000)}`,
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
