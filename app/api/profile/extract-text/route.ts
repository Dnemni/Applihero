import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
// Use dynamic import to handle CommonJS/ESM interop for pdf-parse
export const runtime = 'nodejs';
import { createRequire } from 'module';

/**
 * POST /api/profile/extract-text
 * 
 * Extracts text from uploaded PDF and stores in profile
 * The extracted text is used by the RAG system for personalized coaching
 */
export async function POST(req: NextRequest) {
  try {
    // Minimal polyfills to satisfy pdfjs in server runtime (text extraction only)
    const g: any = global as any;
    if (typeof g.DOMMatrix === 'undefined') {
      g.DOMMatrix = class {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
        constructor() {}
      };
    }
    if (typeof g.ImageData === 'undefined') {
      g.ImageData = class {
        constructor(public data: Uint8ClampedArray = new Uint8ClampedArray(0), public width = 0, public height = 0) {}
      };
    }
    if (typeof g.Path2D === 'undefined') {
      g.Path2D = class { constructor(_d?: string) {} };
    }
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

    // Extract text from PDF using pdfreader (serverless-friendly)
    const require = createRequire(import.meta.url);
    const { PdfReader } = require('pdfreader');
    const extractedText = await new Promise<string>((resolve, reject) => {
      type TextItem = { x: number; y: number; text: string; w?: number };
      const items: TextItem[] = [];
      const reader = new PdfReader();
      reader.parseBuffer(buffer, (err: any, item: any) => {
        if (err) return reject(err);
        if (!item) {
          // Group by Y (line), then sort by X within each line
          const byLine: Record<string, TextItem[]> = {};
          for (const it of items) {
            const key = it.y.toFixed(1);
            byLine[key] = byLine[key] || [];
            byLine[key].push(it);
          }
          const sortedLineKeys = Object.keys(byLine)
            .map(k => parseFloat(k)).sort((a, b) => a - b).map(k => k.toFixed(1));

          const lines: string[] = [];
          let prevY: number | null = null;
          for (const key of sortedLineKeys) {
            const lineItems = byLine[key].sort((a, b) => a.x - b.x);
            // If there's a large vertical gap, add an empty line for spacing
            const currY = parseFloat(key);
            if (prevY !== null && Math.abs(currY - prevY) > 4) {
              lines.push('');
            }
            prevY = currY;

            // Reconstruct line text with spacing heuristics based on x gaps
            let line = '';
            let lastX: number | null = null;
            for (const it of lineItems) {
              if (lastX !== null) {
                const gap = it.x - lastX;
                // Larger gap -> space, very large gap -> separator
                if (gap > 6) {
                  line += ' \u00B7 ';
                } else if (gap > 1.5) {
                  line += ' ';
                }
              }
              // Insert space between words if they are stuck together (common in PDFs)
              let token = it.text
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .replace(/([a-zA-Z])(\d)/g, '$1 $2')
                .replace(/(\d)([a-zA-Z])/g, '$1 $2')
                .replace(/&(?=[A-Za-z])/g, ' & ')
                .replace(/\s*&\s*/g, ' & ')
                .replace(/\.(?=[A-Za-z])/g, '. ')
                .replace(/,(?=\S)/g, ', ')
                .replace(/\s{2,}/g, ' ');
              line += token;
              lastX = it.x + (it.w ?? token.length * 0.6);
            }
            lines.push(line.trim());
          }

          const text = lines.join('\n')
            // Fix common PDF concatenations like "UniversityAug" -> "University Aug"
            .replace(/([a-zA-Z])(\.)/g, '$1$2 ') // ensure space after periods in initials
            .replace(/([a-zA-Z])(,)([a-zA-Z])/g, '$1, $3')
            .replace(/\s*\|\s*/g, ' | ')
            .replace(/\s*:\s*/g, ': ')
            .replace(/\s*\((?=\S)/g, ' (')
            .replace(/(?<=\S)\)\s*/g, ') ')
            .replace(/\s{2,}/g, ' ')
            // Fix domain spacing issues like "gmail. com", "linkedin. com"
            .replace(/\b([a-z0-9._%+-]+)\s*\.\s*(com|org|net|io|ai)\b/gi, '$1.$2')
            .replace(/\b(linked\s*in)\.\s*(com)\b/gi, 'linkedin.$2')
            // Normalize common tech names
            .replace(/\bNext\.?\s*js\b/g, 'Next.js')
            .replace(/\bReact\.?\s*js\b/g, 'React.js')
            .replace(/\bMongo\s*DB\b/g, 'MongoDB')
            .replace(/\bGit\s*Hub\b/g, 'GitHub')
            .replace(/\bMusic\s*Net\b/g, 'MusicNet')
            // Insert spaces around common glued words
            .replace(/([a-z])(?=and\b)/g, '$1 ')
            .replace(/([a-z])(?=for\b)/g, '$1 ')
            .replace(/([a-z])(?=with\b)/g, '$1 ')
            .replace(/([a-z])(?=from\b)/g, '$1 ')
            .replace(/([a-z])(?=into\b)/g, '$1 ')
            .replace(/([a-z])(?=onto\b)/g, '$1 ')
            .replace(/([a-z])(?=about\b)/g, '$1 ')
            .replace(/([a-z])(?=wrote\b)/g, '$1 ')
            .replace(/([a-z])(?=research\b)/g, '$1 ')
            .replace(/([a-z])(?=paper\b)/g, '$1 ')
            // Collapse residual multiple spaces
            .replace(/\s{2,}/g, ' ');

          return resolve(text.trim());
        }
        if (item && item.text && typeof item.x === 'number' && typeof item.y === 'number') {
          items.push({ x: item.x, y: item.y, text: item.text, w: item.w });
        }
      });
    });

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
