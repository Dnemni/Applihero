import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { latex, filename, command } = await req.json();
    if (!latex) return NextResponse.json({ error: "Missing latex" }, { status: 400 });

    // Use LaTeX.Online public API to compile LaTeX to PDF (serverless-friendly)
    const compiler = "https://latexonline.cc/compile";
    const tex = String(latex);
    const cmd = command ? String(command) : "pdflatex";

    let resp: Response;
    // Avoid 414 by uploading .tex to storage and passing a URL when large
    if (tex.length > 1500) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ error: "Missing Supabase credentials for large LaTeX compile" }, { status: 500 });
      }
      const supabase = createClient(supabaseUrl, supabaseKey);
         // Use existing private resumes bucket
         const bucket = "resumes";
      const id = crypto.randomBytes(8).toString("hex");
         const objectPath = `latex/${id}.tex`;
      const upload = await supabase.storage.from(bucket).upload(objectPath, tex, { contentType: "application/x-tex", upsert: true });
      if (upload.error) {
        return NextResponse.json({ error: "Failed to upload LaTeX", details: upload.error.message }, { status: 500 });
      }
      // Create a signed URL accessible by LaTeX.Online
      const signed = await supabase.storage.from(bucket).createSignedUrl(objectPath, 60 * 10); // 10 minutes
      if (signed.error || !signed.data?.signedUrl) {
        return NextResponse.json({ error: "Failed to create signed URL", details: signed.error?.message }, { status: 500 });
      }
      const params = new URLSearchParams();
      params.set("url", signed.data.signedUrl);
      params.set("command", cmd);
      resp = await fetch(`${compiler}?${params.toString()}`);
    } else {
      const params = new URLSearchParams();
      params.set("text", tex);
      params.set("command", cmd);
      resp = await fetch(`${compiler}?${params.toString()}`);
    }
    if (!resp.ok) {
      const errText = await resp.text();
      return NextResponse.json({ error: "External compile failed", details: errText }, { status: 500 });
    }
    const arrayBuffer = await resp.arrayBuffer();
    return new Response(arrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename || 'resume.pdf'}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Compile failed" }, { status: 500 });
  }
}
