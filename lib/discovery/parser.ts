import { createHash } from "crypto";
import type {
  ParsedRequirement,
  RequirementCategory,
  RequirementPriority,
} from "./types";

export const REQUIREMENTS_PARSER_VERSION = "requirements-v9";

const SKILL_ALIASES: Record<string, string[]> = {
  javascript: ["javascript", "js", "ecmascript"],
  typescript: ["typescript", "ts"],
  python: ["python"],
  java: ["java"],
  c: [" c ", "c programming", "language c"],
  "c++": ["c++", "cpp"],
  "c#": ["c#", "c sharp"],
  go: ["golang", "go programming"],
  rust: ["rust"],
  react: ["react", "react.js", "reactjs"],
  nextjs: ["next.js", "nextjs"],
  nodejs: ["node.js", "nodejs"],
  sql: ["sql", "postgres", "postgresql", "mysql"],
  aws: ["aws", "amazon web services"],
  azure: ["azure"],
  gcp: ["gcp", "google cloud"],
  docker: ["docker", "containerization"],
  kubernetes: ["kubernetes", "k8s"],
  git: ["git", "github", "gitlab"],
  linux: ["linux", "unix"],
  "machine learning": ["machine learning", "ml"],
  "artificial intelligence": ["artificial intelligence", " ai ", "ai-powered", "ai tools", "ai agents"],
  "full stack": ["full stack", "full-stack", "fullstack"],
  programming: ["programming language", "software development", "software engineering"],
  automation: ["automation", "automated", "automating"],
  "data structures": ["data structures", "algorithms"],
  "rest api": ["rest api", "restful", "api development"],
};

const REQUIREMENT_HINT = /\b(requirements?|qualifications?|must|should|need(?:ed)?|experience|proficien(?:cy|t)?|familiar(?:ity)?|knowledge|degree|graduate|graduation|eligible|authorization|sponsor|located|location|available|ability to)\b/i;
const PREFERRED_HINT = /\b(preferred|bonus|nice[- ]to[- ]have|plus|ideally|desired)\b/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function htmlToPlainText(html: string): string {
  const decoded = html
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

  return decoded
    .replace(/<\/?(?:p|div|section|article|h[1-6]|ul|ol|li|br)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map(normalizeWhitespace)
    .filter(Boolean)
    .join("\n");
}

export function extractNormalizedTerms(text: string): string[] {
  const haystack = text.toLowerCase();
  return Object.entries(SKILL_ALIASES)
    .filter(([, aliases]) => aliases.some(alias => {
      const escaped = alias.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(haystack);
    }))
    .map(([canonical]) => canonical);
}

function categorizeRequirement(text: string): RequirementCategory {
  const lower = text.toLowerCase();
  if (/sponsor|work authorization|authorized to work|citizen|citizenship/.test(lower)) return "work_authorization";
  if (/graduation|graduating|graduate (?:in|between|before|after|by)|class of 20\d{2}|expected.{0,30}20\d{2}|(?:semester|schooling|quarter).{0,30}(?:remaining|after)/.test(lower)) return "graduation_window";
  if (/degree|bachelor|master|phd|university|college/.test(lower)) return "education";
  if (/remote|hybrid|on[- ]site|onsite|relocat|located/.test(lower)) return "location";
  if (/start date|available|availability|commitment|hours per week/.test(lower)) return "availability";
  if (extractNormalizedTerms(text).length > 0) return "technical_skill";
  if (/\d+\+?\s*(?:years?|yrs?)|experience/.test(lower)) return "experience";
  if (/industry|domain|fintech|healthcare|security|enterprise|consumer/.test(lower)) return "domain_experience";
  return "other";
}

function getPriority(text: string): RequirementPriority {
  return PREFERRED_HINT.test(text) ? "preferred" : "minimum";
}

function requirementId(text: string, index: number): string {
  return `${hashText(text).slice(0, 10)}-${index}`;
}

export function parseJobRequirements(description: string): ParsedRequirement[] {
  type Section = "unknown" | "requirements" | "preferred" | "responsibilities" | "ignore";
  const lines: Array<{ text: string; section: Section; sectionPriority: RequirementPriority }> = [];
  let sectionPriority: RequirementPriority = "minimum";
  let section: Section = "unknown";

  const headingPatterns: Array<{ pattern: RegExp; section: Section }> = [
    { pattern: /^(?:preferred|bonus|nice[- ]to[- ]have|desired|what we value|our values)(?: qualifications?| skills?)?/i, section: "preferred" },
    { pattern: /^(?:minimum|required|basic)?\s*(?:qualifications?|requirements?|what you(?:'|’)ll need|what you bring|who you are|you are|about you|your background|skills and experience)/i, section: "requirements" },
    { pattern: /^(?:responsibilities|what you(?:'|’)ll do|what you will do|the role|about the role|day to day|your impact|during your (?:internship|placement).{0,35}(?:opportunities|you may))/i, section: "responsibilities" },
    { pattern: /^(?:about (?:us|the company|offerup)|company|why join|benefits|perks|compensation|salary|pay range|equal opportunity|eeo|privacy|accommodation|additional information)/i, section: "ignore" },
  ];

  const boilerplate = /\b(?:equal employment|equal opportunity|affirmative action|nondiscrimination|non-discrimination|prohibits discrimination|protected veteran|applicable (?:state|federal|local) laws?|benefits[- ]eligible|compensation|hourly rate|pay range|salary range|base pay|base salary|additional compensation|on target earnings|sales commissions?|sales bonuses?|reasonable accommodations?|background check|privacy policy|redact (?:age|date)|date of birth|practice assessments?|interview guides?|invite you to sign up|showcase your very best|top (?:shopping|marketplace) apps?)\b/i;
  const nonRequirement = /\b(?:employee benefits?|benefits include|competitive salary|equity|401\s*\(?k\)?|health(?:,? dental| insurance)?|vision(?: insurance)?|life insurance|short[- ]term disability|long[- ]term disability|paid parental|caregiver leave|flexible time off|commuter benefits?|wellness stipend|set[- ]?up reimbursement|office amenities|team gatherings|want to learn more|learn more about our benefits|interviewing \+ culture|operating principles|reasons not to work)\b/i;

  for (const rawLine of description.replace(/\r/g, "").split(/\n/)) {
    const cleanedLine = normalizeWhitespace(rawLine.replace(/^[•*\-–—\d.)\s]+/, ""));
    if (!cleanedLine) continue;

    if (/^(?:compensation|benefits|perks|equal opportunity|eeo|privacy|accommodation)\s*:/i.test(cleanedLine)) {
      section = "ignore";
      continue;
    }

    // ATS text commonly uses headings such as "Full-Time Employee Benefits
    // Include:". Recognize the heading even when it has a prefix, otherwise
    // every following perk inherits the prior requirements section.
    if (/\b(?:employee benefits?|benefits include|compensation and benefits?|total rewards|perks)\b/i.test(cleanedLine)) {
      section = "ignore";
      continue;
    }

    // Some ATS feeds omit a qualifications heading but introduce the block
    // with a hard candidate requirement. Treat the remainder as requirements
    // instead of leaving it attached to an earlier responsibilities section.
    if (/^(?:candidates?|applicants?)\s+must\b/i.test(cleanedLine)) {
      section = "requirements";
      sectionPriority = "minimum";
    }

    if (/^currently pursuing\b/i.test(cleanedLine)) {
      section = "requirements";
      sectionPriority = "minimum";
    }
    if (/^bring your curiosity\b/i.test(cleanedLine)) {
      section = "preferred";
      sectionPriority = "preferred";
      continue;
    }
    if (/^you don['’]t need to be an expert\b|^to give yourself the best opportunity\b/i.test(cleanedLine)) continue;

    const looksLikeHeading = cleanedLine.length <= 90 && !/[.!?]$/.test(cleanedLine);
    if (looksLikeHeading) {
      const heading = headingPatterns.find(item => item.pattern.test(cleanedLine));
      if (heading) {
        section = heading.section;
        sectionPriority = heading.section === "preferred" ? "preferred" : "minimum";
        continue;
      }
    }

    const sentences = cleanedLine.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
    for (const sentence of sentences) {
      const text = normalizeWhitespace(sentence);
      if (text.length >= 18 && text.length <= 420 && !boilerplate.test(text) && !nonRequirement.test(text) && !/^\$[\d,.]+(?:\s*(?:&mdash;|[-–—])\s*\$[\d,.]+)?\s*USD$/i.test(text)) {
        lines.push({ text, section, sectionPriority });
      }
    }
  }

  const sectionRequirements = lines.filter(line => line.section === "requirements" || line.section === "preferred");
  const fallbackCandidates = lines.filter(line => line.section !== "ignore" && line.section !== "responsibilities" && REQUIREMENT_HINT.test(line.text));
  const source = sectionRequirements.length > 0
    ? sectionRequirements
    : fallbackCandidates.length >= 2
      ? fallbackCandidates
      : lines.filter(line => line.section !== "ignore" && extractNormalizedTerms(line.text).length > 0);
  const seen = new Set<string>();

  return source
    .filter(line => {
      const key = line.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24)
    .map((line, index) => {
      const category = categorizeRequirement(line.text);
      return {
        id: requirementId(line.text, index),
        text: line.text,
        sourceQuote: line.text,
        category,
        priority: PREFERRED_HINT.test(line.text) ? getPriority(line.text) : line.sectionPriority,
        normalizedTerms: extractNormalizedTerms(line.text),
        needsUserConfirmation: category === "work_authorization" || category === "availability" || category === "location",
        confidence: category === "other" ? 0.65 : 0.85,
      };
    });
}
