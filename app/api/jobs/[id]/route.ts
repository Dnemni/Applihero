import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";

/**
 * PUT /api/jobs/[id]
 * Update job details and reingest documents
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { jobTitle, companyName, jobDescription, userId } = await req.json();
    const jobId = params.id;

    // Update job
    const { error: updateError } = await supabaseAdmin
      .from('jobs')
      .update({
        job_title: jobTitle,
        company_name: companyName,
        job_description: jobDescription,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('Error updating job:', updateError);
      return NextResponse.json({ error: 'Failed to update job' }, { status: 500 });
    }

    // Delete existing job documents and chunks
    const { data: existingDocs } = await supabaseAdmin
      .from('job_documents')
      .select('id')
      .eq('job_id', jobId);

    if (existingDocs && existingDocs.length > 0) {
      // Delete chunks first (foreign key constraint)
      for (const doc of existingDocs) {
        await supabaseAdmin
          .from('job_document_chunks')
          .delete()
          .eq('job_document_id', doc.id);
      }

      // Delete documents
      await supabaseAdmin
        .from('job_documents')
        .delete()
        .eq('job_id', jobId);
    }

    // Reingest documents
    if (userId) {
      try {
        await fetch(`${req.nextUrl.origin}/api/jobs/${jobId}/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
      } catch (err) {
        console.error('Failed to reingest documents:', err);
        // Don't fail the update if ingestion fails
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Update job error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/jobs/[id]
 * Delete job and all related data
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;

    // Delete in order due to foreign key constraints
    
    // 1. Delete chat messages
    await supabaseAdmin
      .from('chat_messages')
      .delete()
      .eq('job_id', jobId);

    // 2. Delete question answers
    const { data: questions } = await supabaseAdmin
      .from('questions')
      .select('id')
      .eq('job_id', jobId);

    if (questions && questions.length > 0) {
      for (const question of questions) {
        await supabaseAdmin
          .from('answers')
          .delete()
          .eq('question_id', question.id);
      }
    }

    // 3. Delete questions
    await supabaseAdmin
      .from('questions')
      .delete()
      .eq('job_id', jobId);

    // 4. Delete document chunks
    const { data: docs } = await supabaseAdmin
      .from('job_documents')
      .select('id')
      .eq('job_id', jobId);

    if (docs && docs.length > 0) {
      for (const doc of docs) {
        await supabaseAdmin
          .from('job_document_chunks')
          .delete()
          .eq('job_document_id', doc.id);
      }
    }

    // 5. Delete documents
    await supabaseAdmin
      .from('job_documents')
      .delete()
      .eq('job_id', jobId);

    // 6. Finally, delete the job itself
    const { error: jobError } = await supabaseAdmin
      .from('jobs')
      .delete()
      .eq('id', jobId);

    if (jobError) {
      console.error('Error deleting job:', jobError);
      return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Delete job error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
