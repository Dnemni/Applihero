import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, openai } from "@/lib/supabase/client";
import { retrieveContext } from "@/lib/rag/retrieval";

/**
 * POST /api/questions/[id]/feedback
 * 
 * Generate AI feedback for an answer based on job context and user background
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, jobId } = await req.json();
    const questionId = params.id;

    if (!userId || !jobId) {
      return NextResponse.json({ error: "Missing userId or jobId" }, { status: 400 });
    }

    // Get question and answer
    const { data: question, error: questionError } = await supabaseAdmin
      .from('questions')
      .select('question_text, answer_text')
      .eq('id', questionId)
      .single();

    if (questionError || !question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    if (!question.answer_text || question.answer_text.trim().length === 0) {
      return NextResponse.json({ error: "No answer to provide feedback on" }, { status: 400 });
    }

    // Get relevant context from RAG system
    const contextChunks = await retrieveContext({
      query: `${question.question_text} ${question.answer_text}`,
      userId,
      jobId,
      topK: 5,
    });

    const context = contextChunks.map(c => c.content).join("\n---\n");

    // Generate feedback using OpenAI
    const feedbackPrompt = `
You are an expert job application coach. Review this application answer and provide constructive feedback.

CONTEXT (Resume, Transcript, Job Description):
${context}

QUESTION:
${question.question_text}

CANDIDATE'S ANSWER:
${question.answer_text}

TASK:
1. Give a score from 1-10 (10 being excellent)
2. Provide 3-5 specific, actionable bullet points of feedback
3. Focus on: relevance to job, use of specific examples, clarity, and alignment with candidate's background
4. Be constructive and encouraging

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:
Score: X/10

Feedback:
• [First point]
• [Second point]
• [Third point]
• [Fourth point]
• [Fifth point]
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert job application coach who provides specific, actionable feedback."
        },
        {
          role: "user",
          content: feedbackPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const feedbackText = completion.choices[0]?.message?.content || "";

    // Parse score from response
    const scoreMatch = feedbackText.match(/Score:\s*(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : null;

    // Extract bullet points
    const feedbackMatch = feedbackText.match(/Feedback:([\s\S]*)/i);
    const feedbackNotes = feedbackMatch ? feedbackMatch[1].trim() : feedbackText;

    // Save feedback to database
    const { error: updateError } = await supabaseAdmin
      .from('questions')
      .update({
        feedback_score: score,
        feedback_notes: feedbackNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', questionId);

    if (updateError) {
      console.error('Error saving feedback:', updateError);
      return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
    }

    return NextResponse.json({
      score,
      feedback: feedbackNotes,
    });

  } catch (err: any) {
    console.error("Feedback generation error:", err);
    return NextResponse.json({ 
      error: err.message || "Server error" 
    }, { status: 500 });
  }
}
