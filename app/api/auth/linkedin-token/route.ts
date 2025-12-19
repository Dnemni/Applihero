import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/auth/linkedin-token
 * 
 * Server-side token exchange for LinkedIn OAuth.
 * Exchanges authorization code for access token.
 * This must be done server-side to keep the client secret secure.
 */

const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

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

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/linkedin-callback`;
    
    console.log('LinkedIn token exchange attempt:', {
      hasCode: !!code,
      codeLength: code?.length,
      redirectUri,
      clientIdPresent: !!process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID,
      clientSecretPresent: !!process.env.LINKEDIN_CLIENT_SECRET,
    });

    // Exchange authorization code for access token
    const tokenResponse = await fetch(LINKEDIN_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID || '',
        client_secret: process.env.LINKEDIN_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('LinkedIn token exchange failed:', {
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
          linkedinError: error
        },
        { status: 400 }
      );
    }

    const tokens = await tokenResponse.json();

    if (!tokens.access_token) {
      console.error('No access token in response:', tokens);
      return NextResponse.json(
        { error: 'No access token received from LinkedIn' },
        { status: 400 }
      );
    }

    // Get user info from LinkedIn
    const userInfoResponse = await fetch(LINKEDIN_USERINFO_URL, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    });

    if (!userInfoResponse.ok) {
      console.error('Failed to fetch LinkedIn user info');
      return NextResponse.json(
        { error: 'Failed to fetch user information' },
        { status: 400 }
      );
    }

    const userInfo = await userInfoResponse.json();

    // Return tokens and user info to client
    return NextResponse.json({
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      userInfo: {
        sub: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name,
        given_name: userInfo.given_name,
        family_name: userInfo.family_name,
        picture: userInfo.picture,
      },
    });
  } catch (error) {
    console.error('LinkedIn token exchange error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
