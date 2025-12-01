import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";

// GET - Load existing cover letter
export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const { data, error } = await (supabaseAdmin as any)
      .from("cover_letters")
      .select("*")
      .eq("job_id", params.jobId)
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return NextResponse.json(data || {});
  } catch (error) {
    console.error("Error loading cover letter:", error);
    return NextResponse.json(
      { error: "Failed to load cover letter" },
      { status: 500 }
    );
  }
}

// PUT - Save/Update cover letter
export async function PUT(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const body = await request.json();
    const { content, selectedTemplate, styleSettings, status, userId, templates, aiSuggestions } = body;

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Check if cover letter exists
    const { data: existing } = await (supabaseAdmin as any)
      .from("cover_letters")
      .select("id")
      .eq("job_id", params.jobId)
      .eq("user_id", userId)
      .single();

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await (supabaseAdmin as any)
        .from("cover_letters")
        .update({
          content,
          selected_template: selectedTemplate,
          style_settings: styleSettings,
          status,
          templates: templates ?? undefined,
          ai_suggestions: aiSuggestions ?? undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new
      const { data, error } = await (supabaseAdmin as any)
        .from("cover_letters")
        .insert({
          job_id: params.jobId,
          user_id: userId,
          content,
          selected_template: selectedTemplate,
          style_settings: styleSettings,
          status: status || "draft",
          templates: templates ?? [],
          ai_suggestions: aiSuggestions ?? [],
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error saving cover letter:", error);
    return NextResponse.json(
      { error: "Failed to save cover letter" },
      { status: 500 }
    );
  }
}
