import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { queryCoverLetterTemplates } from "@/lib/rag/cover-letter";

export async function POST(request: NextRequest) {
  try {
    const { jobId, jobDescription, userId, templateStyle = "outline", settings } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    // Get job details
    const { data: job } = await supabaseAdmin
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", userId)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Get user profile for personalization
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    // Generate templates using RAG
    console.log('[Cover Letter Templates] Generating for:', { jobTitle: job.job_title, company: job.company_name, templateStyle, settings });
    const templates = await queryCoverLetterTemplates({
      jobTitle: job.job_title,
      company: job.company_name,
      jobDescription: jobDescription || job.job_description,
      userProfile: profile,
      userId: userId,
      jobId: jobId,
      templateStyle: templateStyle as "complete" | "outline",
      settings: settings,
    });

    console.log('[Cover Letter Templates] Generated:', templates.length, 'templates');
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Error generating templates:", error);
    return NextResponse.json(
      { error: "Failed to generate templates" },
      { status: 500 }
    );
  }
}
