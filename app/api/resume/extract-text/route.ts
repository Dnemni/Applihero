import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { pdfUrl } = await req.json();
    if (!pdfUrl || typeof pdfUrl !== "string") {
      return NextResponse.json(
        { error: "pdfUrl is required" },
        { status: 400 }
      );
    }

    // Download the PDF from the provided URL into a temp file
    const res = await fetch(pdfUrl);
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to download PDF" },
        { status: 500 }
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const tmpDir = process.env.TMPDIR || "/tmp";
    const filePath = path.join(tmpDir, `resume_extract_${Date.now()}.pdf`);
    await fs.promises.writeFile(filePath, buffer);

    // Run the existing extract-text.cjs script as a child process
    const scriptPath = path.join(process.cwd(), "scripts", "extract-text.cjs");

    const text = await new Promise<string>((resolve, reject) => {
      const child = spawn("node", [scriptPath, filePath], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", (err) => {
        reject(err);
      });

      child.on("close", (code) => {
        if (code !== 0) {
          return reject(new Error(stderr || `extract-text.cjs exited with code ${code}`));
        }
        try {
          const parsed = JSON.parse(stdout);
          resolve(typeof parsed.text === "string" ? parsed.text : "");
        } catch (e) {
          reject(e);
        }
      });
    });

    // Cleanup temp file (ignore errors)
    fs.promises.unlink(filePath).catch(() => {});

    return NextResponse.json({ text });
  } catch (err: any) {
    console.error("Error in /api/resume/extract-text:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to extract text" },
      { status: 500 }
    );
  }
}
