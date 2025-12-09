import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";

// POST /api/resume-optimizer/[id]/feedback
// Updates feedback_score and feedback_text on the latest resume_versions row
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { userId, feedbackScore, feedbackText } = body;

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Get latest resume version for this job/user
    const { data: latest, error: fetchError } = await (supabaseAdmin as any)
      .from("resume_versions")
      .select("id")
      .eq("job_id", params.id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError) {
      console.error("Error fetching latest resume version for feedback:", fetchError);
      return NextResponse.json(
        { error: "Failed to locate resume version for feedback" },
        { status: 500 }
      );
    }

    if (!latest) {
      return NextResponse.json(
        { error: "No resume version found to attach feedback" },
        { status: 404 }
      );
    }

    const { error: updateError } = await (supabaseAdmin as any)
      .from("resume_versions")
      .update({
        feedback_score: feedbackScore ?? null,
        feedback_text: feedbackText ?? null,
      })
      .eq("id", latest.id);

    if (updateError) {
      console.error("Error updating feedback on resume version:", updateError);
      return NextResponse.json(
        { error: "Failed to update feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in feedback update route:", error);
    return NextResponse.json(
      { error: "Failed to update feedback" },
      { status: 500 }
    );
  }
}
