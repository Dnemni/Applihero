import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Create Supabase client with service role for admin operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Call the RPC function to get user identities
    const { data, error } = await supabase.rpc('get_user_identities', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Error fetching identities:', error);
      return NextResponse.json(
        { error: 'Failed to fetch user identities' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      identities: data,
    });
  } catch (error) {
    console.error('Check identities error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
