import type { DiscoveryJob, ParsedRequirement, RequirementCategory } from "./types";

export type DiscoveryAnswer = {
  id?: string;
  question_key: string;
  category: RequirementCategory;
  question: string;
  answer: string;
  normalized_value: string;
  reuse_approved: boolean;
  source_job_id: string | null;
  provided_at: string;
};

export type DiscoveryQuestion = {
  key: string;
  category: RequirementCategory;
  prompt: string;
  sourceRequirement: string;
  options: Array<{ label: string; value: string }>;
};

export const DISCOVERY_ANSWER_FRESHNESS_DAYS = 7;

export function isDiscoveryAnswerFresh(answer: DiscoveryAnswer, now = Date.now()) {
  if (answer.question_key.startsWith("preference_")) return true;
  const providedAt = new Date(answer.provided_at).getTime();
  return Number.isFinite(providedAt) && now - providedAt <= DISCOVERY_ANSWER_FRESHNESS_DAYS * 24 * 60 * 60 * 1000;
}

export function pendingDiscoveryQuestions(job: DiscoveryJob, answers: DiscoveryAnswer[]) {
  const freshKeys = new Set(answers.filter(answer => isDiscoveryAnswerFresh(answer)).map(answer => answer.question_key));
  return buildDiscoveryQuestions(job).filter(question => !freshKeys.has(question.key));
}

export function availabilityQuestionKey(text: string) {
  const season = text.match(/\b(spring|summer|fall|autumn|winter)\b/i)?.[1]?.toLowerCase().replace("autumn", "fall");
  const year = text.match(/\b20\d{2}\b/)?.[0];
  return `availability_${[season, year].filter(Boolean).join("_") || "general"}`;
}

export function internshipPeriod(text: string) {
  const season = text.match(/\b(spring|summer|fall|autumn|winter)\b/i)?.[1];
  const year = text.match(/\b20\d{2}\b/)?.[0];
  return season && year ? `${season.replace(/^./, character => character.toUpperCase()).replace(/Autumn/i, "Fall")} ${year}` : null;
}

function questionFor(requirement: ParsedRequirement, job: DiscoveryJob): DiscoveryQuestion | null {
  if (requirement.category === "work_authorization") {
    const exportControlled = /U\.S\. citizen|U\.S\. national|lawful permanent resident|green card|refugee under|asylee under|ITAR|export control/i.test(requirement.text);
    if (exportControlled) return {
      key: "us_person_export_control",
      category: requirement.category,
      prompt: "Do you meet this posting’s stated U.S.-person/export-control definition?",
      sourceRequirement: requirement.text,
      options: [
        { label: "Yes — citizen, national, permanent resident, refugee, or asylee", value: "meets" },
        { label: "No", value: "does_not_meet" },
        { label: "I’m not sure", value: "not_sure" },
      ],
    };
    return {
      key: "work_authorization_us",
      category: requirement.category,
      prompt: "What is your current U.S. work authorization situation?",
      sourceRequirement: requirement.text,
      options: [
        { label: "Authorized without sponsorship", value: "authorized_without_sponsorship" },
        { label: "Authorized now; may need future sponsorship", value: "authorized_with_future_sponsorship" },
        { label: "Not currently authorized", value: "not_authorized" },
        { label: "I’m not sure", value: "not_sure" },
      ],
    };
  }
  if (requirement.category === "availability") {
    const period = `${job.title} ${requirement.text}`;
    const label = period.match(/\b(spring|summer|fall|autumn|winter)\s+20\d{2}\b/i)?.[0] || "the role’s dates";
    return {
      key: availabilityQuestionKey(period),
      category: requirement.category,
      prompt: `Would you be available for ${label}?`,
      sourceRequirement: requirement.text,
      options: [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
        { label: "I’m not sure yet", value: "not_sure" },
      ],
    };
  }
  if (
    (requirement.category === "location" || /\bonsite\b|\bon-site\b|\bbased in an office\b|\bin office\b/i.test(requirement.text)) &&
    (requirement.needsUserConfirmation || /\bonsite\b|\bon-site\b|\bbased in an office\b|\bin office\b/i.test(requirement.text))
  ) {
    return {
      key: `location_${job.id}`,
      // This can be reached from a legacy/misclassified parser item. Persist
      // the semantic category expected by the database constraint, not the
      // raw item category.
      category: "location",
      prompt: `Could you work under this location requirement: “${requirement.text}”?`,
      sourceRequirement: requirement.text,
      options: [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
        { label: "I’m not sure", value: "not_sure" },
      ],
    };
  }
  return null;
}

export function buildDiscoveryQuestions(job: DiscoveryJob): DiscoveryQuestion[] {
  const questions = (job.parsed_requirements || []).map(requirement => questionFor(requirement, job)).filter(Boolean) as DiscoveryQuestion[];
  const titlePeriod = internshipPeriod(job.title);
  if (!questions.some(question => question.category === "availability") && /\bintern(?:ship)?|co-?op\b/i.test(job.title) && titlePeriod) {
    const period = titlePeriod;
    questions.push({
      key: availabilityQuestionKey(job.title),
      category: "availability",
      prompt: `Would you be available for ${period}?`,
      sourceRequirement: `The role is scheduled for ${period}.`,
      options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }, { label: "I’m not sure yet", value: "not_sure" }],
    });
  }
  return Array.from(new Map(questions.map(question => [question.key, question])).values());
}

export function answersToMatchingContext(answers: DiscoveryAnswer[]) {
  const freshAnswers = answers.filter(answer => isDiscoveryAnswerFresh(answer));
  if (!freshAnswers.length) return "";
  return [
    "APPLIHERO CONFIRMED ELIGIBILITY FACTS (user supplied):",
    ...freshAnswers.map(answer => `APPLIHERO_CONFIRMED key=${answer.question_key} value=${answer.normalized_value} provided=${answer.provided_at.slice(0, 10)}`),
  ].join("\n");
}
