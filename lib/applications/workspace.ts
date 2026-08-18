import { supabaseAdmin } from "@/lib/supabase/client";
import { buildQuickFit, MATCHER_VERSION } from "@/lib/discovery/matcher";
import { hashText } from "@/lib/discovery/parser";
import { getCachedMatch, getDiscoveryJob, getUserBackground } from "@/lib/discovery/repository";
import { getLatestApplicationForm } from "./form-snapshot";
import type { JobFitAnalysis, QuickFit } from "@/lib/discovery/types";

export interface ApplicationWorkspaceContext {
  officialUrl: string | null;
  discoveryUrl: string | null;
  quickFit: QuickFit | null;
  analysis: JobFitAnalysis | null;
  form: any | null;
  plan: {
    headline: string;
    priority: "high" | "medium" | "low";
    summary: string;
    nextSteps: string[];
    resumeGuidance: string[];
  };
}

export async function getApplicationWorkspaceContext(userId: string, jobId: string): Promise<ApplicationWorkspaceContext> {
  const db = supabaseAdmin as any;
  const { data: application, error } = await db.from("jobs")
    .select("id,user_id,job_title,company_name,job_description,discovery_job_id,status")
    .eq("id", jobId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!application) throw new Error("Application not found");

  let quickFit: QuickFit | null = null;
  let analysis: JobFitAnalysis | null = null;
  let officialUrl: string | null = null;
  if (application.discovery_job_id) {
    const [job, background] = await Promise.all([
      getDiscoveryJob(application.discovery_job_id), getUserBackground(userId, application.discovery_job_id),
    ]);
    if (job) {
      officialUrl = job.apply_url || job.source_url;
      const profileHash = hashText(background);
      analysis = await getCachedMatch({ userId, jobId: job.id, profileHash, jobHash: job.content_hash, matcherVersion: MATCHER_VERSION }) as JobFitAnalysis | null;
      quickFit = analysis ? {
        score: analysis.score, band: analysis.band, label: analysis.label, reasons: [analysis.fitSummary || analysis.summary],
        supportedCount: analysis.requirements.filter(item => item.status === "supported").length,
        requirementCount: analysis.requirements.length, eligibility: analysis.eligibility, source: "analysis",
        matcherVersion: MATCHER_VERSION, evaluatedProfileHash: profileHash, evaluatedJobHash: job.content_hash,
      } : buildQuickFit(job, background);
    }
  }
  const form = await getLatestApplicationForm(jobId);
  const fields = (form?.application_form_fields || []) as any[];
  const unresolved = fields.filter(field => field.required && !field.suggested_answer);
  const narrative = fields.filter(field => field.field_type === "textarea");
  const priority = analysis?.recommendation.priority || (quickFit?.score != null && quickFit.score >= 70 ? "high" : quickFit?.score != null && quickFit.score >= 45 ? "medium" : "low");
  const resumeGuidanceCandidates = analysis ? [
    ...analysis.strengths.slice(0, 2).map(item => `Make ${item.title.toLowerCase()} easy to find: ${item.evidence}`),
    ...analysis.gaps.filter(item => item.kind !== "conflict").slice(0, 2).map(item => item.action),
  ] : ["Compare the top requirements against the first half of your resume before applying."];
  const resumeGuidance = resumeGuidanceCandidates.length ? resumeGuidanceCandidates : [
    "Keep your strongest directly relevant project or internship evidence in the top half of the resume; do not add claims that are not supported by your experience.",
  ];
  const nextSteps = [
    unresolved.length ? `Confirm ${unresolved.length} required field${unresolved.length === 1 ? "" : "s"} that cannot be answered safely from your profile.` : fields.length ? "Review the imported answers before copying them to the official form." : "Open the official posting and review the live application form; this provider does not expose its fields publicly.",
    narrative.length ? `Draft ${narrative.length} written response${narrative.length === 1 ? "" : "s"} in Application questions.` : "Check whether the live form adds written questions after you begin.",
    priority === "high" ? "Treat this as a priority application; complete it while the posting is current." : priority === "medium" ? "Apply after resolving the open eligibility and resume-positioning items." : "Do not spend significant tailoring time until the eligibility or role-alignment concerns are resolved.",
  ];
  return {
    officialUrl, discoveryUrl: application.discovery_job_id ? `/discover/${application.discovery_job_id}` : null,
    quickFit, analysis, form,
    plan: {
      headline: analysis?.recommendation.label || quickFit?.label || "Application preparation",
      priority,
      summary: analysis?.fitSummary || analysis?.summary || quickFit?.reasons?.[0] || `Prepare your application for ${application.job_title} at ${application.company_name}.`,
      nextSteps, resumeGuidance,
    },
  };
}

export function workspaceContextForCoach(context: ApplicationWorkspaceContext): string {
  const fields = (context.form?.application_form_fields || []) as any[];
  return [
    "APPLICATION STRATEGY FROM DISCOVERY:",
    `Priority: ${context.plan.priority}. ${context.plan.headline}`,
    `Fit summary: ${context.plan.summary}`,
    context.analysis?.roleSummary ? `Role summary: ${context.analysis.roleSummary}` : "",
    context.analysis?.applicantSummary ? `Applicant summary: ${context.analysis.applicantSummary}` : "",
    `Next steps: ${context.plan.nextSteps.join(" | ")}`,
    `Resume guidance: ${context.plan.resumeGuidance.join(" | ")}`,
    fields.length ? `Observed application fields: ${fields.map(field => `${field.required ? "required" : "optional"} ${field.label}${field.suggested_answer ? " (answer available from profile)" : ""}`).join("; ")}` : "Observed application fields: none available from the provider; tell the user to verify the live form.",
    context.officialUrl ? `Official application URL: ${context.officialUrl}` : "",
  ].filter(Boolean).join("\n");
}
