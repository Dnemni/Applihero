// DELETE - Remove resume version for a job/user
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const userId = body.userId;
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }
    // Remove all resume_versions for this job/user
    const { error } = await (supabaseAdmin as any)
      .from("resume_versions")
      .delete()
      .eq("job_id", params.id)
      .eq("user_id", userId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting resume version:", error);
    return NextResponse.json(
      { error: "Failed to delete resume version" },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";

// GET - Load optimized resume for a job
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const { data, error } = await (supabaseAdmin as any)
      .from("resume_versions")
      .select("*")
      .eq("job_id", params.id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // If no resume version found, fallback to profile resume_url
    if (!data) {
      const { data: profile, error: profileError } = await (supabaseAdmin as any)
        .from("profiles")
        .select("resume_url")
        .eq("id", userId)
        .single();
      if (profileError) {
        throw profileError;
      }
      return NextResponse.json({ current_url: profile?.resume_url || null });
    }

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading resume version:", error);
    return NextResponse.json(
      { error: "Failed to load resume version" },
      { status: 500 }
    );
  }
}

// POST - Save optimized resume version
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { userId, originalText, optimizedText, originalFileUrl, feedbackScore, feedbackText, currentUrl, latex_code } = body;

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Check if this is the first version for this job
    const { data: existingVersions } = await (supabaseAdmin as any)
      .from("resume_versions")
      .select("id")
      .eq("job_id", params.id)
      .eq("user_id", userId);

    const isFirstVersion = !existingVersions || existingVersions.length === 0;

    // If first version and no currentUrl provided, get from profile
    let finalCurrentUrl = currentUrl;
    if (isFirstVersion && !finalCurrentUrl) {
      const { data: profile } = await (supabaseAdmin as any)
        .from("profiles")
        .select("resume_url")
        .eq("id", userId)
        .single();
      
      finalCurrentUrl = profile?.resume_url || null;
    }

    // Always create a new version (allows version history)
    const { data, error } = await (supabaseAdmin as any)
      .from("resume_versions")
      .insert({
        job_id: params.id,
        user_id: userId,
        original_text: originalText,
        optimized_text: optimizedText,
        original_file_url: originalFileUrl || null,
        current_url: finalCurrentUrl || null,
        feedback_score: feedbackScore || null,
        feedback_text: feedbackText || null,
        latex_code: latex_code || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error saving resume version:", error);
    return NextResponse.json(
      { error: "Failed to save resume version" },
      { status: 500 }
    );
  }
}
