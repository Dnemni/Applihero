import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";

export const runtime = "nodejs";

function runPdflatex(cwd: string, texFilename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = spawn("pdflatex", ["-interaction=nonstopmode", texFilename], {
      cwd,
      env: process.env,
    });
    let stderr = "";
    cmd.stderr.on("data", (d) => { stderr += d.toString(); });
    cmd.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pdflatex exited with code ${code}: ${stderr}`));
    });
    cmd.on("error", (err) => reject(err));
  });
}

export async function POST(req: NextRequest) {
  try {
    const { latex, filename } = await req.json();
    if (!latex) return NextResponse.json({ error: "Missing latex" }, { status: 400 });

    // Create temp working directory
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "latex-compile-"));
    const texName = (filename && String(filename).replace(/[^A-Za-z0-9_.-]/g, "")) || "resume.tex";
    const texPath = path.join(tmpDir, texName);

    // Write LaTeX source
    await fs.writeFile(texPath, latex, "utf8");

    // Run pdflatex twice to resolve references if any
    await runPdflatex(tmpDir, texName);
    await runPdflatex(tmpDir, texName);

    const pdfPath = texPath.replace(/\.tex$/, ".pdf");
    const pdfBytes = await fs.readFile(pdfPath);

    // Clean up aux files (best-effort)
    const auxFiles = [".aux", ".log", ".out", ".toc"].map(ext => texPath.replace(/\.tex$/, ext));
    await Promise.all(auxFiles.map(f => fs.rm(f).catch(() => {})));
    // Note: tmpDir left for OS to clean; removing can be added if desired

    return new Response(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="resume.pdf"',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Compile failed" }, { status: 500 });
  }
}
