import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";

interface ParsedBioData {
    hobbies: Array<{
        name: string;
        category?: string;
        description?: string;
    }>;
}

/**
 * Extract hobbies and interests from bio text using OpenAI
 */
async function extractHobbiesFromBio(bioText: string): Promise<ParsedBioData> {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
        throw new Error('OpenAI API key not configured');
    }

    const prompt = `Extract hobbies and interests from the following bio text. Return a JSON object with the following structure:
{
  "hobbies": [
    {
      "name": "hobby/interest name",
      "category": "sports|arts|volunteering|technology|music|travel|reading|other",
      "description": "optional description"
    }
  ]
}

Bio text:
${bioText}

Return ONLY valid JSON, no additional text or markdown formatting. If no hobbies are found, return an empty array.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert at extracting hobbies and interests from personal bio text. Return valid JSON only.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
        throw new Error('No content in OpenAI response');
    }

    return JSON.parse(content) as ParsedBioData;
}

/**
 * POST /api/profile/parse-bio
 * 
 * Extracts hobbies and interests from bio text and populates hobbies_interests table
 */
export async function POST(req: NextRequest) {
    try {
        const { userId, bio } = await req.json();

        if (!userId || !bio) {
            return NextResponse.json(
                { error: 'userId and bio are required' },
                { status: 400 }
            );
        }

        if (!bio.trim()) {
            // If bio is empty, delete all hobbies for this user
            await (supabaseAdmin.from('hobbies_interests') as any)
                .delete()
                .eq('user_id', userId);

            return NextResponse.json({
                success: true,
                message: 'Bio is empty, cleared hobbies',
            });
        }

        // Extract hobbies from bio
        const parsedData = await extractHobbiesFromBio(bio);

        // Delete existing hobbies for this user
        await (supabaseAdmin.from('hobbies_interests') as any)
            .delete()
            .eq('user_id', userId);

        // Insert new hobbies
        if (parsedData.hobbies && parsedData.hobbies.length > 0) {
            const hobbiesData = parsedData.hobbies.map(hobby => ({
                user_id: userId,
                name: hobby.name,
                category: hobby.category || null,
                description: hobby.description || null,
            }));

            const { error: hobbiesError } = await (supabaseAdmin.from('hobbies_interests') as any)
                .insert(hobbiesData);

            if (hobbiesError) {
                console.error('Error inserting hobbies:', hobbiesError);
                throw hobbiesError;
            }

            console.log(`Inserted ${hobbiesData.length} hobbies from bio`);
        }

        return NextResponse.json({
            success: true,
            hobbiesCount: parsedData.hobbies?.length || 0,
            message: `Extracted ${parsedData.hobbies?.length || 0} hobbies from bio`,
        });

    } catch (err: any) {
        console.error("Parse bio error:", err);
        return NextResponse.json(
            { error: err.message || "Server error" },
            { status: 500 }
        );
    }
}

