import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { ingestJobDocument } from "@/lib/rag/ingestion";

/**
 * POST /api/jobs/[id]/ingest
 * 
 * Ingests user's resume, transcript, and job description into RAG system
 * This should be called after creating a new job application
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await req.json();
    
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const jobId = params.id;

    // Get user's profile (resume & transcript)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('resume_text, transcript_text')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error("Error fetching profile:", profileError);
      return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
    }

    console.log('Profile data:', {
      hasResumeText: !!profile?.resume_text,
      hasTranscriptText: !!profile?.transcript_text,
      resumeLength: profile?.resume_text?.length || 0,
      transcriptLength: profile?.transcript_text?.length || 0,
    });

    // Get job details
    const { data: job, error: jobError } = await supabaseAdmin
      .from('jobs')
      .select('job_title, company_name, job_description')
      .eq('id', jobId)
      .single();

    if (jobError) {
      console.error("Error fetching job:", jobError);
      return NextResponse.json({ error: "Failed to fetch job" }, { status: 500 });
    }

    const documentsToIngest = [];

    // 1. Ingest Resume
    if (profile.resume_text) {
      console.log('Inserting resume document...');
      const { data: resumeDoc, error: resumeDocError } = await supabaseAdmin
        .from('job_documents')
        .insert({
          job_id: jobId,
          document_type: 'other',
          title: 'Resume',
          content: profile.resume_text,
          document_url: null,
        })
        .select()
        .single();

      if (resumeDocError) {
        console.error('Resume doc insert error:', resumeDocError);
      } else if (resumeDoc) {
        console.log('Resume document created:', resumeDoc.id);
        documentsToIngest.push({
          id: resumeDoc.id,
          content: profile.resume_text,
          type: 'resume'
        });
      }
    } else {
      console.log('No resume_text found in profile');
    }

    // 2. Ingest Transcript
    if (profile.transcript_text) {
      console.log('Inserting transcript document...');
      const { data: transcriptDoc, error: transcriptDocError } = await supabaseAdmin
        .from('job_documents')
        .insert({
          job_id: jobId,
          document_type: 'other',
          title: 'Academic Transcript',
          content: profile.transcript_text,
          document_url: null,
        })
        .select()
        .single();

      if (transcriptDocError) {
        console.error('Transcript doc insert error:', transcriptDocError);
      } else if (transcriptDoc) {
        console.log('Transcript document created:', transcriptDoc.id);
        documentsToIngest.push({
          id: transcriptDoc.id,
          content: profile.transcript_text,
          type: 'transcript'
        });
      }
    } else {
      console.log('No transcript_text found in profile');
    }

    // 3. Ingest Job Description
    if (job.job_description) {
      console.log('Inserting job description document...');
      const { data: jobDoc, error: jobDocError } = await supabaseAdmin
        .from('job_documents')
        .insert({
          job_id: jobId,
          document_type: 'other',
          title: `${job.job_title} at ${job.company_name}`,
          content: job.job_description,
          document_url: null,
        })
        .select()
        .single();

      if (jobDocError) {
        console.error('Job description doc insert error:', jobDocError);
      } else if (jobDoc) {
        console.log('Job description document created:', jobDoc.id);
        documentsToIngest.push({
          id: jobDoc.id,
          content: job.job_description,
          type: 'job_description'
        });
      }
    } else {
      console.log('No job_description found');
    }

    // Ingest all documents into vector database
    const ingestionResults = [];
    for (const doc of documentsToIngest) {
      try {
        await ingestJobDocument({
          userId,
          jobId,
          jobDocumentId: doc.id,
          content: doc.content,
          replaceExisting: true,
        });
        ingestionResults.push({ type: doc.type, status: 'success' });
      } catch (err) {
        console.error(`Failed to ingest ${doc.type}:`, err);
        ingestionResults.push({ type: doc.type, status: 'failed', error: String(err) });
      }
    }

    return NextResponse.json({
      message: "Document ingestion complete",
      results: ingestionResults,
      totalDocuments: documentsToIngest.length,
    });

  } catch (err: any) {
    console.error("Ingestion route error:", err);
    return NextResponse.json({ 
      error: err.message || "Server error" 
    }, { status: 500 });
  }
}
