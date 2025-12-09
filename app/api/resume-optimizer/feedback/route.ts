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

    // Retrieve contextual information, including past feedback
    // Get past feedback for this job/user
    const { data: pastVersions } = await (supabaseAdmin as any)
      .from("resume_versions")
      .select("feedback_text")
      .eq("job_id", jobId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    const pastFeedbacks = (pastVersions || [])
      .map((v: any) => v.feedback_text)
      .filter((f: any) => !!f)
      .map((f: any) => typeof f === "string" ? f : JSON.stringify(f));

    const ctx = await retrieveContext({
      userId,
      jobId,
      query: `Resume feedback for ${jobTitle} at ${company}`,
      matchCount: 6,
    });

    const contextStr = ctx.map((c) => c.content).join("\n---\n");
    const pastFeedbackStr = pastFeedbacks.length > 0 ? `\nPAST FEEDBACK:\n${pastFeedbacks.join("\n---\n")}` : "";

    const systemPrompt = `You are an expert resume reviewer and career coach. Analyze the resume and provide constructive feedback for the specific job position. Focus on:
    - How well the resume aligns with job requirements (key skills, experiences, keywords, etc.; be specific based on the job description and context)
    - Specific improvements that would increase chances
    - Skills and experiences that should be emphasized
    - Any gaps or missing information
    - Overall effectiveness rating (0-100, where 100 means perfect alignment and 0 means no alignment)

    Provide feedback in JSON format with score and specific suggestions. The score should always be between 0 and 100, and should leave room for improvement even if the resume is strong.`;

    const userPrompt = `Analyze this resume for the following job position and provide detailed feedback.

    JOB DETAILS:
    Position: ${jobTitle} at ${company}
    Description: ${jobDescription}

    RESUME:
    ${resumeText}

    ADDITIONAL CONTEXT (from background):
    ${contextStr}

    This is the past feedback given on previous versions of this resume for this job. Ensure that your feedback builds upon or addresses these previous points while also addressing any new changes if necessary. If there are no changes in the work, the score should be similar to before. If you see some improvement in these areas, then adjust the score accordingly:
    ${pastFeedbackStr.length > 0 ? pastFeedbackStr : " None."}

    Provide feedback in this JSON format:
    {
      "score": <0-100>,
      "summary": "One sentence overall assessment",
      "strengths": ["strength 1", "strength 2", "strength 3"],
      "improvements": [
        {
          "section": "section name or phrase",
          "suggestion": "specific improvement",
          "reason": "why this matters for the job"
        }
      ],
      "keyword_gaps": ["keyword 1", "keyword 2"],
      "priority_changes": ["top change 1", "top change 2"]
    }`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
    });

    const responseText = completion.choices[0].message?.content || "{}";
    
    // Parse JSON response
    let feedback;
    try {
      // Extract JSON from response if it contains other text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      feedback = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch (e) {
      console.error("Error parsing feedback JSON:", e);
      feedback = {
        score: 0,
        summary: "Unable to parse feedback",
        strengths: [],
        improvements: [],
        keyword_gaps: [],
        priority_changes: [],
      };
    }

    return NextResponse.json({
      score: feedback.score || 0,
      feedback: feedback,
    });
  } catch (error) {
    console.error("Error generating feedback:", error);
    return NextResponse.json(
      { error: "Failed to generate feedback" },
      { status: 500 }
    );
  }
}
