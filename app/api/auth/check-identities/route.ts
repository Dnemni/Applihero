import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { userMetadataIndicatesPassword } from '@/lib/auth/password-status';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json().catch(() => ({}));
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Missing Supabase server configuration' }, { status: 500 });
    }

    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: authenticatedUser, error: authError } = await authClient.auth.getUser(token);

    if (authError || !authenticatedUser.user) {
      return NextResponse.json({ error: 'Invalid authorization token' }, { status: 401 });
    }

    if (userId && userId !== authenticatedUser.user.id) {
      return NextResponse.json({ error: 'Cannot inspect another user' }, { status: 403 });
    }

    // Create Supabase client with service role for admin operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get user data from auth.users table
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(authenticatedUser.user.id);

    if (userError) {
      console.error('Error fetching user:', userError);
      return NextResponse.json(
        { error: 'Failed to fetch user data', details: userError },
        { status: 500 }
      );
    }

    // Extract identity providers from user identities
    const identityProviders = userData.user.identities?.map(identity => identity.provider) || [];
    let hasStoredPassword = false;

    const { data: passwordData, error: passwordError } = await supabase
      .rpc('user_has_password' as never, { p_user_id: authenticatedUser.user.id } as never);

    if (!passwordError) {
      hasStoredPassword = Boolean(passwordData);
    }

    const hasPassword =
      hasStoredPassword ||
      identityProviders.includes('email') ||
      userMetadataIndicatesPassword(userData.user);

    return NextResponse.json({
      identities: identityProviders,
      hasPassword,
      hasGoogle: identityProviders.includes('google'),
      hasLinkedIn: identityProviders.includes('linkedin'),
      passwordSource: hasStoredPassword ? 'auth.users' : hasPassword ? 'metadata_or_identity' : null,
    });
  } catch (error) {
    console.error('Check identities error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
