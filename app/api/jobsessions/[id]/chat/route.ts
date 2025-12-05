import { NextRequest, NextResponse } from "next/server";
import { retrieveContext } from "@/lib/rag/retrieval";
import { openai, supabaseAdmin } from "@/lib/supabase/client";
import { SYSTEM_COACH, buildCoachPrompt } from "@/lib/rag/prompts";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { message, userId } = body; // TODO: replace with real auth user ID

    if (!message?.trim()) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Retrieve previous chat messages for context
    let previousMessages = "";
    try {
      const { data: messages } = await supabaseAdmin
        .from("chat_messages")
        .select("role, content")
        .eq("job_id", params.id)
        .order("created_at", { ascending: true })
        .limit(20); // Last 20 messages for context
      
      if (messages && messages.length > 0) {
        previousMessages = (messages as any[])
          .map((msg: any) => `${msg.role === "assistant" ? "Coach" : "User"}: ${msg.content}`)
          .join("\n\n");
      }
    } catch (err) {
      // If we can't get previous messages, continue without them
      console.error("Error fetching previous messages:", err);
    }

    // Retrieve contextual chunks
    const ctx = await retrieveContext({
      userId,
      jobId: params.id,
      query: message,
    });

    const prompt = buildCoachPrompt({
      question: message,
      contextChunks: ctx.map((c) => c.content),
      previousMessages,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_COACH },
        { role: "user", content: prompt },
      ],
    });

    const reply = completion.choices[0].message.content ?? "";

    // Persist user and assistant messages
    try {
      await supabaseAdmin.from("chat_messages").insert([
        {
          job_id: params.id,
          role: "user",
          content: message,
        },
        {
          job_id: params.id,
          role: "assistant",
          content: reply,
        },
      ] as any);
    } catch (persistErr) {
      // Log but do not fail the response
      console.error("Chat message persistence failed", persistErr);
    }

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error("Chat route error", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
