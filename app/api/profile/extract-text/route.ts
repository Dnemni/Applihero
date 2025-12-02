import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
// Use dynamic import to handle CommonJS/ESM interop for pdf-parse

/**
 * POST /api/profile/extract-text
 * 
 * Extracts text from uploaded PDF and stores in profile
 * The extracted text is used by the RAG system for personalized coaching
 */
export async function POST(req: NextRequest) {
  try {
    // Ensure pdf.js uses server-friendly settings
    process.env.PDFJS_DISABLE_FONT_FACE = process.env.PDFJS_DISABLE_FONT_FACE || 'true';
    process.env.PDFJS_WORKER_DISABLED = process.env.PDFJS_WORKER_DISABLED || 'true';
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;
    const fileType = formData.get('fileType') as string;

    if (!file || !userId || !fileType) {
      return NextResponse.json({
        error: "Missing file, userId, or fileType"
      }, { status: 400 });
    }

    if (fileType !== 'resume' && fileType !== 'transcript') {
      return NextResponse.json({
        error: "fileType must be 'resume' or 'transcript'"
      }, { status: 400 });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from PDF using serverless-friendly pdf-parse
    const pdfModule = await import('pdf-parse');
    const pdfParseFn = ((pdfModule as any).default ?? (pdfModule as any)) as (data: Buffer) => Promise<{ text: string }>;
    const parsed = await pdfParseFn(buffer);
    const extractedText = (parsed.text || '').trim();

    if (!extractedText || extractedText.trim().length === 0) {
      return NextResponse.json({
        error: "Could not extract text from PDF"
      }, { status: 400 });
    }

    // Save text to profile
    const updateData = fileType === 'resume'
      ? { resume_text: extractedText }
      : { transcript_text: extractedText };

    const { error: updateError } = await (supabaseAdmin.from('profiles') as any)
      .update(updateData)
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return NextResponse.json({
        error: "Failed to save extracted text"
      }, { status: 500 });
    }

    console.log(`Extracted ${extractedText.length} characters from ${fileType} for user ${userId}`);

    return NextResponse.json({
      success: true,
      textLength: extractedText.length,
      message: `Extracted ${extractedText.length} characters from ${fileType}`
    });

  } catch (err: any) {
    console.error("Extract text error:", err);
    return NextResponse.json({
      error: err.message || "Server error"
    }, { status: 500 });
  }
}
