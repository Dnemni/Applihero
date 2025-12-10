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
    } = body as {
      oldLatex?: string;
      oldPdfUrl?: string;
      newText: string;
      styleHint?: string;
    };

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
  * Preserves the overall structure, layout, and macros of OLD_LATEX when STYLE_HINT indicates the same style.
  * When STYLE_HINT indicates a different style (for example chronological, functional, combination, modern, classic, onepage), you MUST change the overall layout and sectioning to clearly match that style instead of copying the original Jake template.
  * Change the margins or spacing if necessary to fit content appropriately. There should not be any overlap of text in the final output.
  * Uses NEW_CONTENT to populate name, contact info, education, experience, projects, skills, etc.
  * Compiles with pdflatex: no undefined commands, no missing \\item or \\end commands.
- You MUST NOT change the actual wording of NEW_CONTENT: no paraphrasing, no rewriting, no adding or removing words. You may only change where lines break, how bullets/sections are grouped, and the LaTeX structure.
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

          // For Jake's style, provide the full explicit LaTeX example so the
          // model can closely match the desired visual layout.
          if (styleHint.toLowerCase().includes("jake")) {
            userPromptParts.push(`
    JAKE_TEMPLATE_EXAMPLE (for reference when STYLE_HINT refers to Jake's style):
    \\documentclass[letterpaper,11pt]{article}

    \\usepackage{latexsym}
    \\usepackage[empty]{fullpage}
    \\usepackage{titlesec}
    \\usepackage{marvosym}
    \\usepackage[usenames,dvipsnames]{color}
    \\usepackage{verbatim}
    \\usepackage{enumitem}
    \\usepackage[hidelinks]{hyperref}
    \\usepackage{fancyhdr}
    \\usepackage[english]{babel}
    \\usepackage{tabularx}
    \\input{glyphtounicode}

    \\pagestyle{fancy}
    \\fancyhf{}
    \\fancyfoot{}
    \\renewcommand{\\headrulewidth}{0pt}
    \\renewcommand{\\footrulewidth}{0pt}

    % Adjust margins
    \\addtolength{\\oddsidemargin}{-0.5in}
    \\addtolength{\\evensidemargin}{-0.5in}
    \\addtolength{\\textwidth}{1in}
    \\addtolength{\\topmargin}{-.5in}
    \\addtolength{\\textheight}{1.0in}

    \\urlstyle{same}

    \\raggedbottom
    \\raggedright
    \\setlength{\\tabcolsep}{0in}

    % Sections formatting
    \\titleformat{\\section}{
      \\\\vspace{-4pt}\\scshape\\raggedright\\large
    }{}{0em}{}[\\color{black}\\titlerule \\\\vspace{-5pt}]

    % Ensure ATS/machine readable
    \\pdfgentounicode=1

    %-------------------------
    % Custom commands
    \\newcommand{\\resumeItem}[1]{
      \\\\item\\small{
        {#1 \\\\vspace{-2pt}}
      }
    }

    % New resumeSubheading formatting
    \\newcommand{\\resumeSubheading}[4]{
      \\\\vspace{-2pt}\\item
        \\\\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
          \\\\textbf{#1} & #2 \\\\\\\n+      \\\\textit{\\small#3} & \\\\textit{\\small #4} \\\\\\\n+    \\\\end{tabular*}\\vspace{-7pt}
    }


    \\newcommand{\\resumeProjectHeading}[2]{
        \\\\item
        \\\\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}
          \\\\small#1 & #2 \\\\\\\n+    \\\\end{tabular*}\\vspace{-7pt}
    }

    \\newcommand{\\resumeSubItem}[1]{\\resumeItem{#1}\\vspace{-4pt}}

    \\renewcommand\\labelitemii{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}

    \\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]} 
    \\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
    \\newcommand{\\resumeItemListStart}{\\begin{itemize}}
    \\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}

    %-------------------------------------------
    %%%%%%  RESUME STARTS HERE  %%%%%%%%%%%%%%%%%%%%%%%%%%%%

    \\begin{document}

    %----------HEADING----------
    \\begin{center}
        {\\Huge \\scshape Dhruv Nemani} \\\\ \\vspace{1pt}
        \\small (408) 805-6716 $|$ \\href{mailto:DhruvNemani@gmail.com}{\\underline{DhruvNemani@gmail.com}} $|$
        \\href{https://www.linkedin.com/in/dhruv-nemani/}{\\underline{linkedin.com/in/dhruv-nemani}} \\\\
        Saratoga, CA 95070
    \\end{center}

    %-----------EDUCATION-----------
    \\section{Education}
      \\\\resumeSubHeadingListStart
        \\\\resumeSubheading
          {Purdue University}{Aug. 2024 -- Jun. 2028}
          {B.S. in Computer Science \\\& Artificial Intelligence; Cum. GPA: 3.82}{West Lafayette, IN}
          \\\\resumeItemListStart
            \\\\resumeItem{\\textbf{Relevant Courses}: Advanced Programming in C \\\& Java, Data Structures \\\& Algorithms, Computer Architecture, Advanced Probability \\\& Statistics, Python Programming for Data Analytics}
            \\\\resumeItem{\\textbf{Honors/Awards}: Dean’s List and Semester Honors, Fall 2024 \\\& Spring 2025}
          \\\\resumeItemListEnd

        \\\\resumeSubheading
          {Saratoga High School}{Aug. 2020 -- Jun. 2024}
          {High School Diploma; Cum. GPA: 4.65}{Saratoga, CA}
          \\\\resumeItemListStart
            \\\\resumeItem{AP Courses: Computer Science A, Calculus BC, Physics C: Mechanics \\\& E\\\&M, Statistics}
          \\\\resumeItemListEnd
      \\\\resumeSubHeadingListEnd

    %-----------EXPERIENCE-----------
    \\section{Experience}
      \\\\resumeSubHeadingListStart
        \\\\resumeSubheading
          {Founder \\\& Developer}{May 2025 -- Present}
          {AI-powered Course Manager \\\& Study Helper}{Saratoga, CA}
          \\\\resumeItemListStart
            \\\\resumeItem{Built Next.js prototype to generate micro-learning plans with RAG-based scheduling}
            \\\\resumeItem{Implemented calendar sync, progress tracking, and study material generation features}
          \\\\resumeItemListEnd

        \\\\resumeSubheading
          {President \\\& Founding Member}{Aug. 2024 -- Present}
          {Purdue Squash Club}{Purdue University, IN}
          \\\\resumeItemListStart
            \\\\resumeItem{Founded and grew club to 100+ members; organized practices and tournaments}
            \\\\resumeItem{Managed budgets, court reservations, and travel logistics for CSA Nationals}
            \\\\resumeItem{Captained team to 3rd place in division at CSA Nationals}
          \\\\resumeItemListEnd

        \\\\resumeSubheading
          {Software Engineering Intern}{May 2025 -- Aug. 2025}
          {Software Developers Inc.}{Saratoga, CA (Remote)}
          \\\\resumeItemListStart
            \\\\resumeItem{Developed POC agentic AI workflow for travel agent client to book flights and make itinerary}
            \\\\resumeItem{Created AI tools for UI generation from screenshot to full MongoDB integrated project; delivered weekly demos}
          \\\\resumeItemListEnd

        \\\\resumeSubheading
          {Data Analyst Intern}{Jun. 2023 -- Aug. 2023}
          {MobileAction}{San Mateo, CA}
          \\\\resumeItemListStart
            \\\\resumeItem{Collected and analyzed mobile app store data for ASO and ad intelligence}
            \\\\resumeItem{Worked with operations team to validate predictive models for Apple Search Ads}
          \\\\resumeItemListEnd
      \\\\resumeSubHeadingListEnd

    %-----------PROJECTS-----------
    \\section{Projects}
      \\\\resumeSubHeadingListStart
        \\\\resumeProjectHeading
          {\\textbf{AI-Powered Course Manager (POC)} $|$ \\\emph{Next.js, Cursor, Copilot, RAG Models}}{May 2025 -- Present}
          \\\\resumeItemListStart
            \\\\resumeItem{Built micro-learning scheduler and study content generator web-app}
          \\\\resumeItemListEnd

        \\\\resumeProjectHeading
          {\\textbf{FRC Scouting Web App} $|$ \\\emph{React.js}}{Jul. 2021 -- Jun. 2024}
          \\\\resumeItemListStart
            \\\\resumeItem{Led development of scouting app for FRC Team MSET 649; mentored 4 freshmen in strategy \\\& development}
          \\\\resumeItemListEnd

        \\\\resumeProjectHeading
          {\\textbf{Inspirit AI Research Program} $|$ \\\emph{Python, ML, MusicNet}}{Oct. 2022 -- Mar. 2023}
          \\\\resumeItemListStart
            \\\\resumeItem{Developed an AI algorithm to convert mp3 audio files into sheet music trained on MusicNet dataset of 320 songs}
            \\\\resumeItem{Presented findings and wrote research paper}
          \\\\resumeItemListEnd

        \\\\resumeProjectHeading
          {\\textbf{Inspirit AI - AI Emotion Detection Program} $|$ \\\emph{Python, ML}}{Jul. 2022 -- Mar. 2023}
          \\\\resumeItemListStart
            \\\\resumeItem{Built and trained AI models; presented emotion-detection software at Inspirit AI programs}
          \\\\resumeItemListEnd

        \\\\resumeProjectHeading
          {\\textbf{Cal Poly -- EPIC Engineering Program}}{Jun. 2021 -- Jul. 2021}
          \\\\resumeItemListStart
            \\\\resumeItem{Used Python; built Arduino projects with motors \\\& sensors; developed a Rube-Goldberg machine}
          \\\\resumeItemListEnd

        \\\\resumeProjectHeading
          {\\textbf{Indiana University -- Business is Global High School Program}}{Jun. 2021 -- Jul. 2021}
      \\\\resumeSubHeadingListEnd

    %-----------TECHNICAL SKILLS-----------
    \\section{Technical Skills}
     \\\\begin{itemize}[leftmargin=0.15in, label={}]
        \\\\small{\\item{
         \\\\textbf{Languages \\\& Tools}{: Java, C, C++, Python, Next.js, React.js, GameMaker, Scratch, GitHub} \\\\\\
         \\\\textbf{Data/Analysis}{: Quantitative Analysis, Data Collection, \\\& Modeling} \\\\\\
         \\\\textbf{Other}{: Teaching/Coaching, Public Speaking \\\& Debate, Robotics, Conversational Spanish, Conversational Hindi}
        }}
     \\\\end{itemize}

    \\end{document}
    `);
          }
        }

    userPromptParts.push(
      "NEW_CONTENT (formatted plain text resume):\n```text\n" +
        newText +
        "\n```"
    );

    // Requirements differ slightly for Jake vs non-Jake styles
    const isJakeStyle = styleHint?.toLowerCase().includes("jake") ?? false;

    if (isJakeStyle) {
      userPromptParts.push(`
Requirements for output (Jake style):
- You MAY use the same packages and commands shown in JAKE_TEMPLATE_EXAMPLE, including titlesec, color, and \\titlerule, so that the layout closely matches that example.
- Ensure the LaTeX compiles with pdflatex given that preamble (include any needed \\usepackage lines).
- Preserve custom commands like \\resumeSubheading, \\resumeItem, etc., if used, and ensure they are defined before use.
- Ensure all itemize environments have matching \\item and \\end{itemize}.
- Escape LaTeX special characters in NEW_CONTENT.
- Return ONLY the LaTeX document, no markdown fences.
- The sections for a Jake's style resume should typically include: Header with name/contact, Education, Experience, Projects, Skills, and optionally Awards or Extracurriculars. These sections should be in that exact order.
- If section headings do not match what Jake's style should have, modify them to be correct (e.g., change "Work History" to "Experience"). Also change the order/format so that it matches Jake's style.
- The order of sections MUST be Header, Education, Experience, Projects, Skills, (Awards/Extracurriculars if contained).
- Ensure the output LaTeX will compile without errors and closely matches the visual layout of the JAKE_TEMPLATE_EXAMPLE.
`);
    } else {
      userPromptParts.push(`
Requirements for output:
- Use only packages and commands that are compatible with pdflatex. Do NOT use fontspec, unicode-math, titlesec, or other packages that require xelatex/lualatex or define styling commands like \\titlerule or color themes.
- Prefer standard fonts (e.g., Computer Modern) and avoid explicit system font selection.
- Keep the same section ordering and macro structure as OLD_LATEX when STYLE_HINT indicates the same style.
- When STYLE_HINT indicates a different style, you may introduce new section headings or environments, but they must still compile under pdflatex and must not depend on undefined macros such as \\titlerule or custom section commands unless you also define them in the preamble using standard pdflatex packages.
- Preserve custom commands like \\resumeSubheading, \\resumeItem, etc., if present, and make sure they are defined before use.
- Ensure all itemize environments have matching \\item and \\end{itemize}.
- Escape LaTeX special characters in NEW_CONTENT.
- Return ONLY the LaTeX document, no markdown fences.
`);
    }

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
