import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/profile/parse-bio
 * 
 * This endpoint is deprecated. Bio text is now stored directly in profiles.bio
 * and used by the RAG system without structured parsing.
 * 
 * Kept for backwards compatibility - returns success without doing anything.
 */
export async function POST(req: NextRequest) {
    try {
        const { userId, bio } = await req.json();

        if (!userId) {
            return NextResponse.json(
                { error: 'userId is required' },
                { status: 400 }
            );
        }

        // Bio is now stored directly in profiles table and used by RAG
        // No need for structured parsing into hobbies_interests table
        console.log(`Bio update for user ${userId} - using RAG system, no structured parsing needed`);

        return NextResponse.json({
            success: true,
            message: 'Bio stored successfully (using RAG system)',
        });

    } catch (err: any) {
        console.error("Parse bio error:", err);
        return NextResponse.json(
            { error: err.message || "Server error" },
            { status: 500 }
        );
    }
}

