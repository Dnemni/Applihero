import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import type { DiscoveryJob } from "@/lib/discovery/types";

export type ApplicationFieldType = "text" | "textarea" | "select" | "multiselect" | "file" | "checkbox" | "hidden" | "unknown";

export interface ApplicationFormField {
  externalKey: string;
  label: string;
  fieldType: ApplicationFieldType;
  required: boolean;
  options: string[];
  section: string;
  helpText?: string | null;
  suggestedAnswer?: string | null;
  answerSource?: "profile" | "resume" | "user" | "none";
  confidence?: number;
}

export interface ApplicationFormSnapshotInput {
  source: "career_site" | "browser_extension" | "manual";
  sourceUrl: string;
  provider: string;
  observedAt?: string;
  fields: ApplicationFormField[];
  rawPayload?: unknown;
}

type GreenhouseField = { name?: string; type?: string; values?: Array<{ label?: string }>; value?: string };
type GreenhouseQuestion = { label?: string; required?: boolean; fields?: GreenhouseField[]; description?: string };

function fieldType(value?: string): ApplicationFieldType {
  const types: Record<string, ApplicationFieldType> = {
    input_text: "text", textarea: "textarea", input_file: "file", input_hidden: "hidden",
    multi_value_single_select: "select", multi_value_multi_select: "multiselect", checkbox: "checkbox",
  };
  return types[value || ""] || "unknown";
}

function normalizeGreenhouseQuestions(groups: Array<{ section: string; questions: GreenhouseQuestion[] }>): ApplicationFormField[] {
  return groups.flatMap(({ section, questions }) => questions.flatMap((question, questionIndex) => {
    const visible = (question.fields || []).filter(field => field.type !== "input_hidden");
    if (!visible.length) return [];
    const primary = visible[0];
    return [{
      externalKey: primary.name || `${section}-${questionIndex}`,
      label: (question.label || primary.name || "Application question").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      fieldType: fieldType(primary.type),
      required: Boolean(question.required),
      options: visible.flatMap(field => field.values || []).map(option => option.label || "").filter(Boolean),
      section,
      helpText: question.description || null,
      answerSource: "none" as const,
      confidence: 1,
    }];
  }));
}

export async function fetchApplicationForm(job: DiscoveryJob): Promise<ApplicationFormSnapshotInput> {
  const provider = job.job_sources?.provider || "career_site";
  if (provider !== "greenhouse") {
    return {
      source: "career_site", sourceUrl: job.apply_url || job.source_url, provider,
      fields: [], rawPayload: { reason: "provider_form_not_public" },
    };
  }
  const boardToken = job.job_sources?.external_key;
  if (!boardToken || !/^[A-Za-z0-9_-]+$/.test(boardToken)) throw new Error("Invalid Greenhouse board token");
  const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs/${encodeURIComponent(job.source_job_id)}?questions=true`, {
    headers: { Accept: "application/json", "User-Agent": "AppliHero Application Prep/1.0" },
    cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Greenhouse form returned ${response.status}`);
  const payload = await response.json() as any;
  const fields = normalizeGreenhouseQuestions([
    { section: "Application", questions: payload.questions || [] },
    { section: "Location", questions: payload.location_questions || [] },
    { section: "Compliance", questions: payload.compliance || [] },
    { section: "Demographic", questions: payload.demographic_questions?.questions || [] },
  ]);
  return { source: "career_site", sourceUrl: job.apply_url || job.source_url, provider, fields, rawPayload: payload };
}

function directAnswer(field: ApplicationFormField, profile: any): Pick<ApplicationFormField, "suggestedAnswer" | "answerSource" | "confidence"> {
  const label = field.label.toLowerCase();
  if (/first name/.test(label) && profile.first_name) return { suggestedAnswer: profile.first_name, answerSource: "profile", confidence: 1 };
  if (/last name/.test(label) && profile.last_name) return { suggestedAnswer: profile.last_name, answerSource: "profile", confidence: 1 };
  if (/e-?mail/.test(label) && profile.email) return { suggestedAnswer: profile.email, answerSource: "profile", confidence: 1 };
  const background = [profile.resume_text, profile.transcript_text].filter(Boolean).join("\n");
  const graduation = background.match(/(?:graduat(?:e|ion)|expected|anticipated|–|-)\s*(?:in\s*)?(?:[A-Za-z]+\s+)?(20\d{2})/i);
  if (/graduat|degree end|completion date/.test(label) && graduation) return { suggestedAnswer: graduation[1], answerSource: "resume", confidence: .9 };
  const gpa = background.match(/(?:cum\.?\s*)?gpa\s*[:\-]?\s*(\d\.\d{1,2})/i);
  if (/\bgpa\b/.test(label) && gpa) return { suggestedAnswer: gpa[1], answerSource: "resume", confidence: .95 };
  return { suggestedAnswer: null, answerSource: "none", confidence: 0 };
}

export async function saveApplicationFormSnapshot(args: { jobId: string; userId: string; input: ApplicationFormSnapshotInput }) {
  const db = supabaseAdmin as any;
  const { data: profile } = await db.from("profiles").select("first_name,last_name,email,resume_text,transcript_text").eq("id", args.userId).maybeSingle();
  const fields = args.input.fields.map(field => ({ ...field, ...directAnswer(field, profile || {}) }));
  const contentHash = createHash("sha256").update(JSON.stringify(fields.map(field => ({
    key: field.externalKey, label: field.label, type: field.fieldType, required: field.required, options: field.options,
  })))).digest("hex");
  const { data: snapshot, error } = await db.from("application_form_snapshots").upsert({
    job_id: args.jobId, user_id: args.userId, source: args.input.source, source_url: args.input.sourceUrl,
    provider: args.input.provider, content_hash: contentHash, observed_at: args.input.observedAt || new Date().toISOString(),
    raw_payload: args.input.rawPayload || {},
  }, { onConflict: "job_id,content_hash" }).select("id").single();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return { available: false, fields };
    throw error;
  }
  await db.from("application_form_fields").delete().eq("snapshot_id", snapshot.id);
  if (fields.length) {
    const { error: fieldError } = await db.from("application_form_fields").insert(fields.map((field, index) => ({
      snapshot_id: snapshot.id, job_id: args.jobId, external_key: field.externalKey, label: field.label,
      field_type: field.fieldType, required: field.required, options: field.options, section: field.section,
      help_text: field.helpText || null, suggested_answer: field.suggestedAnswer || null,
      answer_source: field.answerSource || "none", confidence: field.confidence || 0, order_index: index,
    })));
    if (fieldError) throw fieldError;
  }
  await syncEditableQuestions(args.jobId, fields);
  return { available: true, snapshotId: snapshot.id, fields };
}

async function syncEditableQuestions(jobId: string, fields: ApplicationFormField[]) {
  const db = supabaseAdmin as any;
  const editable = fields.filter(field =>
    field.section === "Application" && field.fieldType === "textarea" &&
    !/cover letter|resume|additional document|linkedin|website|portfolio/i.test(field.label)
  );
  if (!editable.length) return;
  const { data: existing } = await db.from("questions").select("question_text").eq("job_id", jobId);
  const known = new Set((existing || []).map((row: any) => row.question_text.trim().toLowerCase()));
  const additions = editable.filter(field => !known.has(field.label.toLowerCase())).map((field, index) => ({
    job_id: jobId, question_text: field.label, answer_text: field.suggestedAnswer || null,
    status: field.suggestedAnswer ? "Draft" : "Not started", order_index: (existing?.length || 0) + index,
  }));
  if (additions.length) await db.from("questions").insert(additions);
}

export async function getLatestApplicationForm(jobId: string) {
  const db = supabaseAdmin as any;
  const { data: snapshot, error } = await db.from("application_form_snapshots")
    .select("id,source,source_url,provider,observed_at,application_form_fields(*)")
    .eq("job_id", jobId).order("observed_at", { ascending: false }).limit(1).maybeSingle();
  if (error && (error.code === "42P01" || error.code === "PGRST205")) return null;
  if (error) throw error;
  return snapshot;
}
