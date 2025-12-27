import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";

/**
 * POST - Update user's first and last name in profile during signup
 * Uses admin client to bypass RLS policies for new user profiles
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, firstName, lastName, email } = await request.json();

    if (!userId || !firstName || !lastName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Wait a moment for the trigger to create the profile
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if profile already exists
    const { data: existingProfile } = await (supabaseAdmin as any)
      .from("profiles")
      .select("id, email")
      .eq("id", userId)
      .single();

    // Build update object - only update names, never update email for existing profiles
    const updateData: any = {
      first_name: firstName,
      last_name: lastName,
    };

    // Only set email for brand new profiles (when creating)
    if (!existingProfile && email) {
      updateData.email = email;
    }

    // Use admin client to update profile with name information
    const { error: profileError } = await (supabaseAdmin as any)
      .from("profiles")
      .update(updateData)
      .eq("id", userId);

    if (profileError) {
      console.error("Error updating profile:", profileError);
      return NextResponse.json(
        { error: "Failed to update profile", details: profileError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in update-names API:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
