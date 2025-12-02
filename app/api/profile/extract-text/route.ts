import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { spawn } from "child_process";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";
import { writeFile, unlink } from "fs/promises";
// Ensure Vercel includes pdf.js-extract in the serverless bundle
import 'pdf.js-extract';
export const runtime = 'nodejs';

/**
 * POST /api/profile/extract-text
 * 
 * Extracts text from uploaded PDF and stores in profile
 * The extracted text is used by the RAG system for personalized coaching
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const userId = formData.get('userId') as string | null;
    const fileType = formData.get('fileType') as string | null;

    if (!file || !userId || !fileType) {
      return NextResponse.json({ error: "Missing file, userId, or fileType" }, { status: 400 });
    }
    if (fileType !== 'resume' && fileType !== 'transcript') {
      return NextResponse.json({ error: "fileType must be 'resume' or 'transcript'" }, { status: 400 });
    }

    // Write uploaded PDF to temp file in /tmp
    const bytes = Buffer.from(await file.arrayBuffer());
    const tmpPath = path.join(tmpdir(), `${randomUUID()}.pdf`);
    await writeFile(tmpPath, bytes);

    // Spawn plain Node script to extract text with pdf.js-extract
    const scriptPath = path.join(process.cwd(), 'scripts', 'extract-text.cjs');
    const child = spawn(process.execPath, [scriptPath, tmpPath], { stdio: ['ignore', 'pipe', 'pipe'] });

    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on('data', (c) => outChunks.push(c as Buffer));
    child.stderr.on('data', (c) => errChunks.push(c as Buffer));

    const exitCode: number = await new Promise((resolve) => child.on('close', (code) => resolve(code ?? 1)));

    // Clean up temp file
    await unlink(tmpPath).catch(() => {});

    if (exitCode !== 0) {
      console.error('Extractor error:', Buffer.concat(errChunks).toString());
      return NextResponse.json({ error: 'PDF extraction failed' }, { status: 500 });
    }

    const payload = JSON.parse(Buffer.concat(outChunks).toString('utf8')) as {
      pages: Array<{ content: Array<{ str: string }> }>;
    };

    // Combine text from all pages
    const extractedText = (payload.pages || [])
      .map((page) => (page.content || []).map((item) => item.str).join(' '))
      .join('\n\n')
      .trim();

    if (!extractedText) {
      return NextResponse.json({ error: 'Could not extract text from PDF' }, { status: 400 });
    }

    const updateData = fileType === 'resume' ? { resume_text: extractedText } : { transcript_text: extractedText };
    const { error: updateError } = await (supabaseAdmin.from('profiles') as any).update(updateData).eq('id', userId);
    if (updateError) {
      console.error('Error updating profile:', updateError);
      return NextResponse.json({ error: 'Failed to save extracted text' }, { status: 500 });
    }

    console.log(`Extracted ${extractedText.length} characters from ${fileType} for user ${userId}`);
    return NextResponse.json({ success: true, textLength: extractedText.length });
  } catch (err: any) {
    console.error('Extract text error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
