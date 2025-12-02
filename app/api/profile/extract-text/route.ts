import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PDFExtract } from 'pdf.js-extract';

/**
 * POST /api/profile/extract-text
 * 
 * Extracts text from uploaded PDF and stores in profile
 * The extracted text is used by the RAG system for personalized coaching
 */
export async function POST(req: NextRequest) {
  try {
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

    // Extract text from PDF using pdf.js-extract
    const pdfExtract = new PDFExtract();
    const options = {}; // Use default options, worker is handled automatically
    const data = await pdfExtract.extractBuffer(buffer, options);

    // Combine text from all pages
    const extractedText = data.pages
      .map(page => page.content.map(item => item.str).join(' '))
      .join('\n\n');

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
