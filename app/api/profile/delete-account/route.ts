import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/client";

/**
 * DELETE - Permanently delete user account and all related data
 * This endpoint requires the user to be authenticated
 */
export async function DELETE(request: NextRequest) {
  try {
    // Get auth token from request
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: "Not authenticated - missing authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Create supabase client with the auth token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      }
    );

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
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
