/**
 * GET /api/resume-optimizer/generate-pdf
 * Returns the generated LaTeX code for the resume.
 * Accepts resumeText or resumeData as query params (JSON stringified).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const resumeText = searchParams.get("resumeText");
    const resumeDataRaw = searchParams.get("resumeData");
    let data: ResumeData;

    if (resumeDataRaw) {
      data = JSON.parse(resumeDataRaw) as ResumeData;
    } else if (resumeText) {
      // Use same heuristic parsing as POST
      const lines = (resumeText as string)
        .split("\n")
        .map((l) => l.trimEnd());
      const nonEmpty = lines.filter((l) => l.trim().length > 0);
      const fullName = nonEmpty[0] ?? "";
      const contactLine =
        nonEmpty[1] ??
        nonEmpty.find((l) => l.toLowerCase().includes("@")) ??
        "";
      const headerLocation = nonEmpty[2] ?? "";
      const contactParts = contactLine.split("|").map((p) => p.trim());
      const phone =
        contactParts.find((p) => /\d{3}.*\d{4}/.test(p)) ?? "";
      const email =
        contactParts.find((p) => p.includes("@")) ?? "";
      const linkedinText =
        contactParts.find((p) =>
          p.toLowerCase().includes("linkedin")
        ) ?? "";
      const linkedinUrl =
        linkedinText && !/^https?:\/+/.test(linkedinText)
          ? `https://${linkedinText}`
          : linkedinText;
      // Section indices
      const sectionIdx: Record<string, number> = {};
      const sectionNames = [
        "Education",
        "Experience",
        "Projects",
        "Technical Skills",
        "Skills",
      ];
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (sectionNames.includes(t)) {
          sectionIdx[t.toLowerCase()] = i;
        }
      }
      const sliceBetween = (start: number, end: number) =>
        lines.slice(start + 1, end > 0 ? end : undefined).map((l) => l.trim());
      const idxEdu = sectionIdx["education"] ?? -1;
      const idxExp = sectionIdx["experience"] ?? -1;
      const idxProj = sectionIdx["projects"] ?? -1;
      const idxSkills =
        sectionIdx["technical skills"] ??
        sectionIdx["skills"] ??
        -1;
      const endEdu =
        idxExp > -1
          ? idxExp
          : idxProj > -1
          ? idxProj
          : idxSkills > -1
          ? idxSkills
          : lines.length;
      const endExp =
        idxProj > -1
          ? idxProj
          : idxSkills > -1
          ? idxSkills
          : lines.length;
      const endProj =
        idxSkills > -1 ? idxSkills : lines.length;
      const eduLines =
        idxEdu > -1 ? sliceBetween(idxEdu, endEdu) : [];
      const expLines =
        idxExp > -1 ? sliceBetween(idxExp, endExp) : [];
      const projLines =
        idxProj > -1 ? sliceBetween(idxProj, endProj) : [];
      const skillsLines =
        idxSkills > -1
          ? sliceBetween(idxSkills, lines.length)
          : [];
      // ---------- EDUCATION ----------
      const education: ResumeData["education"] = [];
      let iEdu = 0;
      while (iEdu < eduLines.length) {
        const line = eduLines[iEdu].trim();
        if (!line) {
          iEdu++;
          continue;
        }
        if (MONTH_RE.test(line)) {
          const header = line;
          const monthMatch = header.match(MONTH_RE);
          let institution = header;
          let dateRange = "";
          if (monthMatch) {
            const idx = header.indexOf(monthMatch[0]);
            institution = header.slice(0, idx).trim();
            const rangeMatch = header
              .slice(idx)
              .match(/.*\d{4}/);
            dateRange = rangeMatch
              ? rangeMatch[0].trim().replace(/\s+–\s+/g, " -- ")
              : header.slice(idx).trim();
          }
          const degreeLine = eduLines[iEdu + 1] ?? "";
          let degree = degreeLine;
          let location = "";
          const locMatch = degreeLine.match(
            /([A-Za-z .&-]+,\s*[A-Z]{2})$/
          );
          if (locMatch) {
            location = locMatch[1].trim();
            degree = degreeLine
              .slice(0, degreeLine.length - location.length)
              .trim();
          }
          iEdu += 2;
          const bullets: string[] = [];
          while (
            iEdu < eduLines.length &&
            eduLines[iEdu].trim().startsWith("•")
          ) {
            bullets.push(
              eduLines[iEdu].replace(/^\s*•\s*/, "").trim()
            );
            iEdu++;
          }
          education.push({
            institution,
            dateRange,
            degree,
            location,
            bullets,
          });
        } else {
          iEdu++;
        }
      }
      // ---------- EXPERIENCE ----------
      const experience: ResumeData["experience"] = [];
      let iExp = 0;
      while (iExp < expLines.length) {
        let line = expLines[iExp].trim();
        if (!line) {
          iExp++;
          continue;
        }
        if (!MONTH_RE.test(line)) {
          iExp++;
          continue;
        }
        const titleAndDates = line;
        const m = titleAndDates.match(MONTH_RE);
        let title = titleAndDates;
        let dateRange = "";
        if (m) {
          const idx = titleAndDates.indexOf(m[0]);
          title = titleAndDates.slice(0, idx).trim();
          const rangeMatch = titleAndDates
            .slice(idx)
            .match(/.*\d{4}/);
          dateRange = rangeMatch
            ? rangeMatch[0].trim().replace(/\s+–\s+/g, " -- ")
            : titleAndDates.slice(idx).trim();
        }
        iExp++;
        const companyLine = expLines[iExp] ?? "";
        let company = companyLine.trim();
        let location = "";
        const locMatch = companyLine.match(
          /([A-Za-z .&-]+,\s*[A-Z]{2}(?:\s*\(.*\))?)$/
        );
        if (locMatch) {
          location = locMatch[1].trim();
          company = companyLine
            .slice(0, companyLine.length - location.length)
            .trim();
        }
        iExp++;
        const bullets: string[] = [];
        while (
          iExp < expLines.length &&
          expLines[iExp].trim().startsWith("•")
        ) {
          bullets.push(
            expLines[iExp].replace(/^\s*•\s*/, "").trim()
          );
          iExp++;
        }
        experience.push({
          title,
          dateRange,
          company,
          location,
          bullets,
        });
      }
      // ---------- PROJECTS ----------
      const projects: ResumeData["projects"] = [];
      let iProj = 0;
      while (iProj < projLines.length) {
        let line = projLines[iProj].trim();
        if (!line) {
          iProj++;
          continue;
        }
        if (!line.startsWith("•")) {
          const header = line;
          let name = header;
          let techStack = "";
          let dateRange = "";
          const dateMatch = header.match(MONTH_RE);
          if (dateMatch) {
            const idx = header.indexOf(dateMatch[0]);
            const beforeDate = header.slice(0, idx).trim();
            const rangeMatch = header
              .slice(idx)
              .match(/.*\d{4}/);
            dateRange = rangeMatch
              ? rangeMatch[0].trim().replace(/\s+–\s+/g, " -- ")
              : header.slice(idx).trim();
            line = beforeDate;
          }
          if (line.includes("|")) {
            const [n, t] = line.split("|");
            name = n.trim();
            techStack = t.trim();
          } else {
            name = line.trim();
          }
          iProj++;
          const bullets: string[] = [];
          while (
            iProj < projLines.length &&
            projLines[iProj].trim().startsWith("•")
          ) {
            bullets.push(
              projLines[iProj]
                .replace(/^\s*•\s*/, "")
                .trim()
            );
            iProj++;
          }
          projects.push({
            name,
            techStack,
            dateRange,
            bullets,
          });
        } else {
          iProj++;
        }
      }
      // ---------- TECHNICAL SKILLS ----------
      let languagesAndTools = "";
      let dataAnalysis = "";
      let other = "";
      for (const l of skillsLines) {
        if (l.startsWith("Languages")) {
          const parts = l.split(":");
          languagesAndTools = (parts[1] ?? "").trim();
        } else if (l.startsWith("Data/Analysis")) {
          const parts = l.split(":");
          dataAnalysis = (parts[1] ?? "").trim();
        } else if (l.startsWith("Other")) {
          const parts = l.split(":");
          other = (parts[1] ?? "").trim();
        }
      }
      const skills: ResumeData["skills"] = {
        languagesAndTools,
        dataAnalysis,
        other,
      };
      data = {
        fullName,
        phone,
        email,
        headerLocation,
        linkedinUrl,
        education,
        experience,
        projects,
        skills,
      };
    } else {
      return NextResponse.json({ error: "Missing resumeText or resumeData" }, { status: 400 });
    }
    const latex = generateResumeLatex(data);
    return NextResponse.json({ latex });
  } catch (error: any) {
    console.error("Error generating LaTeX:", error);
    return NextResponse.json({ error: error?.message || "Failed to generate LaTeX" }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from "next/server";
import {
  generateResumeLatex,
  ResumeData,
} from "@/lib/supabase/services/resume_jakes_template";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const MONTH_RE =
  /(Jan\.|Feb\.|Mar\.|Apr\.|May|Jun\.|Jul\.|Aug\.|Sep\.|Oct\.|Nov\.|Dec\.)\s+\d{4}/;

/**
 * POST /api/resume-optimizer/generate-pdf
 *
 * Generates a formatted PDF from resume text or structured ResumeData.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { resumeText, resumeData, userId, previousPath } = body;

    if (!resumeText && !resumeData) {
      return NextResponse.json(
        { error: "Missing resumeText or resumeData" },
        { status: 400 }
      );
    }

    let data: ResumeData;

    if (resumeData) {
      data = resumeData as ResumeData;
    } else {
      // -------- Heuristic parsing from plain text into ResumeData --------
      const lines = (resumeText as string)
        .split("\n")
        .map((l) => l.trimEnd());

      const nonEmpty = lines.filter((l) => l.trim().length > 0);
      const fullName = nonEmpty[0] ?? "";
      const contactLine =
        nonEmpty[1] ??
        nonEmpty.find((l) => l.toLowerCase().includes("@")) ??
        "";
      const headerLocation = nonEmpty[2] ?? "";

      const contactParts = contactLine.split("|").map((p) => p.trim());
      const phone =
        contactParts.find((p) => /\d{3}.*\d{4}/.test(p)) ?? "";
      const email =
        contactParts.find((p) => p.includes("@")) ?? "";
      const linkedinText =
        contactParts.find((p) =>
          p.toLowerCase().includes("linkedin")
        ) ?? "";

      const linkedinUrl =
        linkedinText && !/^https?:\/\//.test(linkedinText)
          ? `https://${linkedinText}`
          : linkedinText;

      // Section indices
      const sectionIdx: Record<string, number> = {};
      const sectionNames = [
        "Education",
        "Experience",
        "Projects",
        "Technical Skills",
        "Skills",
      ];

      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (sectionNames.includes(t)) {
          sectionIdx[t.toLowerCase()] = i;
        }
      }

      const sliceBetween = (start: number, end: number) =>
        lines.slice(start + 1, end > 0 ? end : undefined).map((l) => l.trim());

      const idxEdu = sectionIdx["education"] ?? -1;
      const idxExp = sectionIdx["experience"] ?? -1;
      const idxProj = sectionIdx["projects"] ?? -1;
      const idxSkills =
        sectionIdx["technical skills"] ??
        sectionIdx["skills"] ??
        -1;

      const endEdu =
        idxExp > -1
          ? idxExp
          : idxProj > -1
          ? idxProj
          : idxSkills > -1
          ? idxSkills
          : lines.length;

      const endExp =
        idxProj > -1
          ? idxProj
          : idxSkills > -1
          ? idxSkills
          : lines.length;

      const endProj =
        idxSkills > -1 ? idxSkills : lines.length;

      const eduLines =
        idxEdu > -1 ? sliceBetween(idxEdu, endEdu) : [];
      const expLines =
        idxExp > -1 ? sliceBetween(idxExp, endExp) : [];
      const projLines =
        idxProj > -1 ? sliceBetween(idxProj, endProj) : [];
      const skillsLines =
        idxSkills > -1
          ? sliceBetween(idxSkills, lines.length)
          : [];

      // ---------- EDUCATION ----------
      const education: ResumeData["education"] = [];
      // pattern: School + date, then degree+location, then bullets
      let iEdu = 0;
      while (iEdu < eduLines.length) {
        const line = eduLines[iEdu].trim();
        if (!line) {
          iEdu++;
          continue;
        }

        // Header line with school + date range
        if (MONTH_RE.test(line)) {
          const header = line;
          const monthMatch = header.match(MONTH_RE);
          let institution = header;
          let dateRange = "";
          if (monthMatch) {
            const idx = header.indexOf(monthMatch[0]);
            institution = header.slice(0, idx).trim();
            // capture full range from month to end
            const rangeMatch = header
              .slice(idx)
              .match(/.*\d{4}/);
            dateRange = rangeMatch
              ? rangeMatch[0].trim().replace(/\s+–\s+/g, " -- ")
              : header.slice(idx).trim();
          }

          const degreeLine = eduLines[iEdu + 1] ?? "";
          let degree = degreeLine;
          let location = "";
          const locMatch = degreeLine.match(
            /([A-Za-z .&-]+,\s*[A-Z]{2})$/
          );
          if (locMatch) {
            location = locMatch[1].trim();
            degree = degreeLine
              .slice(0, degreeLine.length - location.length)
              .trim();
          }

          iEdu += 2;
          const bullets: string[] = [];
          while (
            iEdu < eduLines.length &&
            eduLines[iEdu].trim().startsWith("•")
          ) {
            bullets.push(
              eduLines[iEdu].replace(/^\s*•\s*/, "").trim()
            );
            iEdu++;
          }

          education.push({
            institution,
            dateRange,
            degree,
            location,
            bullets,
          });
        } else {
          iEdu++;
        }
      }

      // ---------- EXPERIENCE ----------
      const experience: ResumeData["experience"] = [];
      let iExp = 0;
      while (iExp < expLines.length) {
        let line = expLines[iExp].trim();
        if (!line) {
          iExp++;
          continue;
        }

        if (!MONTH_RE.test(line)) {
          iExp++;
          continue;
        }

        // title + dateRange on same line
        const titleAndDates = line;
        const m = titleAndDates.match(MONTH_RE);
        let title = titleAndDates;
        let dateRange = "";
        if (m) {
          const idx = titleAndDates.indexOf(m[0]);
          title = titleAndDates.slice(0, idx).trim();
          const rangeMatch = titleAndDates
            .slice(idx)
            .match(/.*\d{4}/);
          dateRange = rangeMatch
            ? rangeMatch[0].trim().replace(/\s+–\s+/g, " -- ")
            : titleAndDates.slice(idx).trim();
        }

        iExp++;
        const companyLine = expLines[iExp] ?? "";
        let company = companyLine.trim();
        let location = "";
        const locMatch = companyLine.match(
          /([A-Za-z .&-]+,\s*[A-Z]{2}(?:\s*\(.*\))?)$/
        );
        if (locMatch) {
          location = locMatch[1].trim();
          company = companyLine
            .slice(0, companyLine.length - location.length)
            .trim();
        }

        iExp++;
        const bullets: string[] = [];
        while (
          iExp < expLines.length &&
          expLines[iExp].trim().startsWith("•")
        ) {
          bullets.push(
            expLines[iExp].replace(/^\s*•\s*/, "").trim()
          );
          iExp++;
        }

        experience.push({
          title,
          dateRange,
          company,
          location,
          bullets,
        });
      }

      // ---------- PROJECTS ----------
      const projects: ResumeData["projects"] = [];
      let iProj = 0;
      while (iProj < projLines.length) {
        let line = projLines[iProj].trim();
        if (!line) {
          iProj++;
          continue;
        }

        // Header line with title | tech and possibly date
        if (!line.startsWith("•")) {
          const header = line;
          let name = header;
          let techStack = "";
          let dateRange = "";

          // Example: "AI-Powered Course Manager (POC) | Next.js, ... May 2025 – Present"
          const dateMatch = header.match(MONTH_RE);
          if (dateMatch) {
            const idx = header.indexOf(dateMatch[0]);
            const beforeDate = header.slice(0, idx).trim();
            const rangeMatch = header
              .slice(idx)
              .match(/.*\d{4}/);
            dateRange = rangeMatch
              ? rangeMatch[0].trim().replace(/\s+–\s+/g, " -- ")
              : header.slice(idx).trim();
            line = beforeDate;
          }

          if (line.includes("|")) {
            const [n, t] = line.split("|");
            name = n.trim();
            techStack = t.trim();
          } else {
            name = line.trim();
          }

          iProj++;
          const bullets: string[] = [];
          while (
            iProj < projLines.length &&
            projLines[iProj].trim().startsWith("•")
          ) {
            bullets.push(
              projLines[iProj]
                .replace(/^\s*•\s*/, "")
                .trim()
            );
            iProj++;
          }

          projects.push({
            name,
            techStack,
            dateRange,
            bullets,
          });
        } else {
          iProj++;
        }
      }

      // ---------- TECHNICAL SKILLS ----------
      let languagesAndTools = "";
      let dataAnalysis = "";
      let other = "";

      for (const l of skillsLines) {
        if (l.startsWith("Languages")) {
          const parts = l.split(":");
          languagesAndTools = (parts[1] ?? "").trim();
        } else if (l.startsWith("Data/Analysis")) {
          const parts = l.split(":");
          dataAnalysis = (parts[1] ?? "").trim();
        } else if (l.startsWith("Other")) {
          const parts = l.split(":");
          other = (parts[1] ?? "").trim();
        }
      }

      const skills: ResumeData["skills"] = {
        languagesAndTools,
        dataAnalysis,
        other,
      };

      data = {
        fullName,
        phone,
        email,
        headerLocation,
        linkedinUrl,
        education,
        experience,
        projects,
        skills,
      };
    }

    // ------- Generate LaTeX using Jake's template -------
    const latex = generateResumeLatex(data);

    // Compile PDF as before
    let compileUrl = process.env.LATEX_COMPILE_URL;
    if (!compileUrl) {
      const origin = req.nextUrl?.origin;
      if (origin) {
        compileUrl = new URL(
          "/api/latex/compile-wasm",
          origin
        ).toString();
      }
    }

    if (!compileUrl) {
      return NextResponse.json({ latex });
    }

    const resp = await fetch(compileUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latex }),
    });

    if (!resp.ok) {
      const msg = await resp.text();
      return NextResponse.json(
        { error: "LaTeX compile failed", details: msg },
        { status: 500 }
      );
    }

    const pdfArrayBuffer = await resp.arrayBuffer();

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey || !userId) {
      return new Response(pdfArrayBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition":
            'inline; filename="resume.pdf"',
        },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const bucket = "resumes";
    const now = new Date()
      .toISOString()
      .replace(/[:.]/g, "-");
    const filePath = `${userId}/generated/resume-${now}.pdf`;

    const uploadRes = await supabase.storage
      .from(bucket)
      .upload(filePath, new Uint8Array(pdfArrayBuffer), {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadRes.error) {
      return NextResponse.json(
        {
          error: "Failed to upload PDF",
          details: uploadRes.error.message,
        },
        { status: 500 }
      );
    }

    if (previousPath) {
      await supabase.storage
        .from(bucket)
        .remove([previousPath])
        .catch(() => {});
    }

    // Save the LaTeX code to resume_versions
    await supabase
      .from("resume_versions")
      .insert({
        job_id: body.jobId,
        user_id: userId,
        original_text: body.originalText ?? "",
        optimized_text: body.optimizedText ?? "",
        original_file_url: body.originalFileUrl ?? null,
        current_url: filePath,
        feedback_score: body.feedbackScore ?? null,
        feedback_text: body.feedbackText ?? null,
        latex_code: body.latex_code ?? latex,
      });

    return NextResponse.json({ path: filePath });
  } catch (error: any) {
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Failed to generate PDF",
      },
      { status: 500 }
    );
  }
}
