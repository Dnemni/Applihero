import { hashText, htmlToPlainText, parseJobRequirements, REQUIREMENTS_PARSER_VERSION } from "./parser";

type GreenhouseJob = {
  id: number;
  title: string;
  content?: string;
  absolute_url: string;
  location?: { name?: string };
  departments?: Array<{ name?: string }>;
  first_published?: string;
  updated_at?: string;
  application_deadline?: string;
  metadata?: Array<{ name?: string; value?: unknown }> | null;
};

type GreenhouseResponse = { jobs?: GreenhouseJob[] };

export interface NormalizedGreenhouseJob {
  source_job_id: string;
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
  raw_payload: GreenhouseJob;
  parsed_requirements: ReturnType<typeof parseJobRequirements>;
  parser_version: string;
  content_hash: string;
}

function inferWorkplaceType(job: GreenhouseJob, description: string): string | null {
  const text = `${job.location?.name || ""} ${description}`.toLowerCase();
  if (/\bhybrid\b/.test(text)) return "hybrid";
  if (/\bremote\b/.test(text)) return "remote";
  if (/\bon[- ]site\b|\bonsite\b|in[- ]office/.test(text)) return "on-site";
  return null;
}

function inferEmploymentType(job: GreenhouseJob, description: string): string | null {
  const text = `${job.title} ${description}`.toLowerCase();
  if (/\bintern(?:ship)?\b/.test(text)) return "internship";
  if (/\bcontract(?:or)?\b/.test(text)) return "contract";
  if (/\bpart[- ]time\b/.test(text)) return "part-time";
  if (/\bfull[- ]time\b/.test(text)) return "full-time";
  return null;
}

export async function fetchGreenhouseBoard(boardToken: string): Promise<NormalizedGreenhouseJob[]> {
  if (!/^[a-zA-Z0-9_-]+$/.test(boardToken)) {
    throw new Error(`Invalid Greenhouse board token: ${boardToken}`);
  }

  const response = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`,
    { headers: { Accept: "application/json" }, cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`Greenhouse returned ${response.status} for ${boardToken}`);
  }

  const payload = (await response.json()) as GreenhouseResponse;
  return (payload.jobs || []).map(job => {
    const descriptionHtml = job.content || "";
    const description = htmlToPlainText(descriptionHtml);
    const contentHash = hashText(JSON.stringify({
      title: job.title,
      description,
      location: job.location?.name || null,
      updatedAt: job.updated_at || null,
      parserVersion: REQUIREMENTS_PARSER_VERSION,
    }));

    return {
      source_job_id: String(job.id),
      title: job.title,
      description,
      description_html: descriptionHtml || null,
      location: job.location?.name || null,
      workplace_type: inferWorkplaceType(job, description),
      employment_type: inferEmploymentType(job, description),
      departments: (job.departments || []).map(item => item.name).filter((name): name is string => Boolean(name)),
      source_url: job.absolute_url,
      apply_url: job.absolute_url,
      source_published_at: job.first_published || null,
      source_updated_at: job.updated_at || null,
      application_deadline: job.application_deadline || null,
      raw_payload: job,
      parsed_requirements: parseJobRequirements(description),
      parser_version: REQUIREMENTS_PARSER_VERSION,
      content_hash: contentHash,
    };
  });
}
