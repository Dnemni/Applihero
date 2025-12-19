import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/auth/google-token
 * 
 * Server-side token exchange for Google OAuth.
 * Exchanges authorization code for ID token and access token.
 * This must be done server-side to keep the client secret secure.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export async function POST(request: NextRequest) {
  try {
    const { code, state } = await request.json();

    if (!code) {
      console.error('No authorization code provided');
      return NextResponse.json(
        { error: 'Authorization code is required' },
        { status: 400 }
      );
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000'}/auth/google-callback`;
    
    console.log('Token exchange attempt:', {
      hasCode: !!code,
      codeLength: code?.length,
      redirectUri,
      clientIdPresent: !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      clientSecretPresent: !!process.env.GOOGLE_CLIENT_SECRET,
    });

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Google token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: error,
        redirectUri: redirectUri,
        parsedError: (() => {
          try { return JSON.parse(error); } catch { return error; }
        })(),
      });
      return NextResponse.json(
        { 
          error: 'Failed to exchange authorization code for tokens',
          details: tokenResponse.statusText,
          googleError: error
        },
        { status: 400 }
      );
    }

    const tokens = await tokenResponse.json();

    if (!tokens.id_token) {
      console.error('No ID token in response:', tokens);
      return NextResponse.json(
        { error: 'No ID token received from Google' },
        { status: 400 }
      );
    }

    // Return tokens to client (they will be used to sign in to Supabase)
    return NextResponse.json({
      idToken: tokens.id_token,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });
  } catch (error) {
    console.error('Token exchange error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
