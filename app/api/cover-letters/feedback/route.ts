import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { analyzeCoverLetter } from "@/lib/rag/cover-letter";

export async function POST(request: NextRequest) {
  try {
    const { content, jobDescription, settings, jobId, userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    // Load previous feedback to pass context
    let previousFeedback = null;
    try {
      const { data } = await (supabaseAdmin as any)
        .from("cover_letters")
        .select("ai_suggestions")
        .eq("job_id", jobId)
        .eq("user_id", userId)
        .single();
      
      if (data?.ai_suggestions) {
        previousFeedback = data.ai_suggestions;
      }
    } catch (e) {
      // No previous feedback, that's ok
    }

    // Get AI feedback on the cover letter
    const analysis = await analyzeCoverLetter({
      content,
      jobDescription,
      settings,
      userId: userId,
      jobId,
      previousFeedback,
    });

    return NextResponse.json({
      score: analysis.score,
      suggestions: analysis.suggestions,
      scores: analysis.scores,
    });
  } catch (error) {
    console.error("Error analyzing cover letter:", error);
    return NextResponse.json(
      { error: "Failed to analyze cover letter" },
      { status: 500 }
    );
  }
}
