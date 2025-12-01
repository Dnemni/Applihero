import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { supabaseAdmin } from "@/lib/supabase/client";

/**
 * DELETE - Permanently delete user account and all related data
 * This endpoint requires the user to be authenticated
 */
export async function DELETE(request: NextRequest) {
  try {
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const userId = user.id;

    // Use admin client to delete user data
    // The database CASCADE DELETE should handle related records,
    // but we'll explicitly delete critical data to ensure cleanup

    // 1. Delete from profiles (CASCADE will handle most related data)
    const { error: profileError } = await (supabaseAdmin as any)
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileError) {
      console.error("Error deleting profile:", profileError);
      throw profileError;
    }

    // 2. Delete auth user (this is the final step)
    const { error: deleteAuthError } = await (supabaseAdmin as any).auth.admin.deleteUser(
      userId
    );

    if (deleteAuthError) {
      console.error("Error deleting auth user:", deleteAuthError);
      throw deleteAuthError;
    }

    return NextResponse.json({ 
      success: true,
      message: "Account deleted successfully" 
    });

  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json(
      { error: "Failed to delete account", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
