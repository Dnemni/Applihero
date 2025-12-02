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
    // Polyfill DOM APIs needed by pdf.js in Node
    try {
      const canvasMod = await import('@napi-rs/canvas');
      const g: any = global as any;
      g.DOMMatrix = g.DOMMatrix || (canvasMod as any).DOMMatrix;
      g.ImageData = g.ImageData || (canvasMod as any).ImageData;
      g.Path2D = g.Path2D || (canvasMod as any).Path2D;
    } catch (polyErr) {
      // If polyfills fail, continue — pdf-parse may still work
      console.warn('Canvas polyfills unavailable:', polyErr);
    }
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
