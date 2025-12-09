import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, openai } from "@/lib/supabase/client";
import { retrieveContext } from "@/lib/rag/retrieval";

export async function POST(request: NextRequest) {
  try {
    const { jobId, jobTitle, company, jobDescription, resumeText, userId } = await request.json();

    if (!userId || !jobId || !resumeText) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Retrieve contextual information (resume, transcript, bio already in resumeText, but get job details)
    const ctx = await retrieveContext({
      userId,
      jobId,
      query: `Resume optimization for ${jobTitle} at ${company}`,
      matchCount: 6,
    });

    const contextStr = ctx.map((c) => c.content).join("\n---\n");

    const systemPrompt = `You are an expert career coach specializing in resume optimization. Your job is to analyze a resume and provide specific, actionable suggestions for tailoring it to a particular job. Focus on:
- Highlighting relevant experiences and skills
- Reframing accomplishments to match job requirements
- Identifying gaps and suggesting improvements
- Reorganizing sections for impact
- Using job-relevant keywords and language
Keep suggestions specific, actionable, and concise.`;

    const userPrompt = `Analyze this resume and provide 6-8 specific suggestions for tailoring it to the following job. Be concrete and actionable.

JOB DETAILS:
Position: ${jobTitle} at ${company}
Description: ${jobDescription}

RESUME:
${resumeText}

ADDITIONAL CONTEXT (from background):
${contextStr}

Provide specific, actionable suggestions in this format:
- "Section or phrase" → Suggestion for how to improve it. Why: [reason related to the job]

Focus on:
1. Which existing experiences to emphasize
2. Which skills to highlight or add
3. How to reframe accomplishments to match job requirements
4. What keywords from the job description should appear in the resume
5. Any gaps or missing information
6. How to reorganize for better impact

Return as a simple bulleted list (no JSON).`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
    });

    const responseText = completion.choices[0].message?.content || "";
    
    // Parse suggestions from response (split by lines starting with -)
    const suggestions = responseText
      .split("\n")
      .filter((line) => line.trim().startsWith("-"))
      .map((line) => line.replace(/^-\s*/, "").trim())
      .filter((s) => s.length > 0);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Error generating suggestions:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}
