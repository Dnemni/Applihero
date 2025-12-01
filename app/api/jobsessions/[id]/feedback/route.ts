import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, openai } from "@/lib/supabase/client";
import { retrieveContext } from "@/lib/rag/retrieval";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const questionId = params.id;
  const { userId, jobId } = await req.json();

  const { data: q, error } = await supabaseAdmin
    .from("questions")
    .select("question_text, answer_text")
    .eq("id", questionId)
    .single();

  // Ensure proper typing for q
  const question: { question_text: string; answer_text: string | null } | null = q as any;

  if (error || !question) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const ctx = await retrieveContext({
    userId,
    jobId,
    query: question.answer_text ?? question.question_text,
  });

  const context = ctx.map((c) => c.content).join("\n---\n");

  const prompt = `
CONTEXT:
${context}

QUESTION:
${question.question_text}

ANSWER:
${question.answer_text}

TASK:
Evaluating as a job application coach, respond in JSON with:
{
  "clarity": 0-10,
  "relevance": 0-10,
  "alignment": 0-10,
  "strengths": "...",
  "improvements": "..."
}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "You are a concise job application coach." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0].message.content ?? "{}";
    let feedback: any;
    try {
      feedback = JSON.parse(raw);
    } catch (parseErr) {
      return NextResponse.json({ error: "Invalid JSON returned by model", raw }, { status: 502 });
    }

    // Basic shape validation
    const scored = {
      clarity: Number(feedback.clarity ?? 0),
      relevance: Number(feedback.relevance ?? 0),
      alignment: Number(feedback.alignment ?? 0),
      strengths: String(feedback.strengths ?? ""),
      improvements: String(feedback.improvements ?? ""),
    };

    return NextResponse.json({ feedback: scored });
  } catch (err: any) {
    console.error("Feedback route error", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
