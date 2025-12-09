import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      oldLatex,      // optional string
      oldPdfUrl,     // optional string – mostly informational
      newText,       // required: updated resume text
      styleHint,     // optional: “Use Jake’s resume style” etc.
    } = body;

    if (!newText) {
      return NextResponse.json(
        { error: "newText is required" },
        { status: 400 }
      );
    }

    // Build the prompt

    const systemPrompt = `
You are an expert LaTeX resume formatter.

Your job:
- Given an example LaTeX resume ("OLD_LATEX") or the url of the previous resume version ("OLD_PDF_URL") and updated resume content ("NEW_CONTENT"),
  produce a single LaTeX document that:
  * Preserves the overall structure, layout, and macros of OLD_LATEX
  * Change the margins or spacing if necessary to fit content appropriately. There should not be any overlap of text in the final output.
  * Uses NEW_CONTENT to populate name, contact info, education, experience, projects, skills, etc.
  * Compiles with pdflatex: no undefined commands, no missing \\item or \\end commands.
- Ensure the output LaTeX is syntactically correct and ready to compile and that the number of pages will be equivalent to that of the OLD_LATEX/OLD_PDF_URL.
- The output PDF should have one page if possible or more if necessary. (Compare to number of pages in OLD_LATEX or OLD_PDF_URL if provided). If the original is a 1-pager, keep it a 1-pager.
- Do NOT explain anything. Output ONLY the LaTeX source code.
- If OLD_LATEX is missing, create a simple one-page resume using the provided preamble.
- Ensure that this will fit on ONLY one standard US letter page (8.5 x 11 inches) with typical (or reduced) margins. If there is no way to do so, then separate sections by a newpage line if necessary so that they are not split between pages.
`;

    const userPromptParts: string[] = [];

    if (oldLatex) {
      userPromptParts.push("OLD_LATEX:\n```latex\n" + oldLatex + "\n```");
    } else {
      userPromptParts.push("OLD_LATEX:\n(none provided)");
    }

    if (oldPdfUrl) {
      userPromptParts.push(
        `OLD_PDF_URL (for style reference, if relevant): ${oldPdfUrl}`
      );
    }

    if (styleHint) {
      userPromptParts.push(`STYLE_HINT:\n${styleHint}`);
    }

    userPromptParts.push(
      "NEW_CONTENT (formatted plain text resume):\n```text\n" +
        newText +
        "\n```"
    );

    userPromptParts.push(`
Requirements for output:
- Keep the same section ordering and macro structure as OLD_LATEX when possible.
- Preserve custom commands like \\resumeSubheading, \\resumeItem, etc., if present.
- Ensure all itemize environments have matching \\item and \\end{itemize}.
- Escape LaTeX special characters in NEW_CONTENT.
- Return ONLY the LaTeX document, no markdown fences.
`);

    const userPrompt = userPromptParts.join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1", // or the latest/good LaTeX-friendly model you have
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    });

    let latex = completion.choices[0]?.message?.content?.trim() || "";

    if (!latex) {
      return NextResponse.json(
        { error: "Model returned empty LaTeX" },
        { status: 500 }
      );
    }

    // Optional: you can sanity-check latex for \begin{document} etc.
    if (!latex.includes("\\begin{document}")) {
      return NextResponse.json(
        { error: "Generated LaTeX missing \\begin{document}", latex },
        { status: 500 }
      );
    }

    // Only return the LaTeX code; client is responsible for saving it with the new version row
    return NextResponse.json({ latex });
  } catch (err: any) {
    console.error("Error in LLM latex generation:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate LaTeX" },
      { status: 500 }
    );
  }
}
