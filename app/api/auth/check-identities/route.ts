import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    console.log('Check identities request:', { userId });

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Verify environment variables
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    console.log('Environment check:', { hasServiceKey, hasUrl });

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

    // Get user data from auth.users table
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);

    if (userError) {
      console.error('Error fetching user:', userError);
      return NextResponse.json(
        { error: 'Failed to fetch user data', details: userError },
        { status: 500 }
      );
    }

    // Extract identity providers from user identities
    const identityProviders = userData.user.identities?.map(identity => identity.provider) || [];
    
    console.log('User identities found:', identityProviders);

    return NextResponse.json({
      identities: identityProviders,
      hasPassword: identityProviders.includes('email'),
      hasGoogle: identityProviders.includes('google'),
      hasLinkedIn: identityProviders.includes('linkedin'),
    });
  } catch (error) {
    console.error('Check identities error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
