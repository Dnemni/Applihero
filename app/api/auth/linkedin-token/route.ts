// app/api/auth/linkedin-token/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getLinkedInRedirectUri } from '@/lib/oauth/redirect';

/**
 * POST /api/auth/linkedin-token
 *
 * Server-side token exchange for LinkedIn OAuth with PKCE.
 * Returns ID token for Supabase signInWithIdToken.
 */

const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

export async function POST(request: NextRequest) {
  try {

    const { code, state } = await request.json();

    // Debug: log all received parameters (with previews)
    console.log('LinkedIn token exchange - received payload:', {
      codePreview: code ? code.substring(0, 8) + '...' + code.slice(-8) : undefined,
      codeLength: code ? code.length : 0,
      statePreview: state ? state.substring(0, 8) + '...' + state.slice(-8) : undefined,
    });

    if (!code) {
      console.error('No authorization code provided');
      return NextResponse.json({ error: 'Authorization code is required' }, { status: 400 });
    }

    const redirectUri = getLinkedInRedirectUri();
    const clientId = (process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID || '').trim();
    const clientSecret = (process.env.LINKEDIN_CLIENT_SECRET || '').trim();

    // Debug: log all credential and redirect info
    console.log('LinkedIn token exchange - credentials and redirect:', {
      clientId,
      clientIdLength: clientId.length,
      clientIdPreview: clientId ? clientId.substring(0, 4) + '...' + clientId.slice(-4) : undefined,
      clientSecretLength: clientSecret.length,
      clientSecretPreview: clientSecret ? clientSecret.substring(0, 4) + '...' + clientSecret.slice(-4) : undefined,
      redirectUri,
      redirectUriLength: redirectUri.length,
    });

    if (!clientId || !clientSecret) {
      console.error('Missing LinkedIn client credentials:', {
        clientId,
        clientSecret,
      });
      return NextResponse.json(
        { error: 'Missing LinkedIn client credentials' },
        { status: 500 }
      );
    }

    // Log the exact request body being sent to LinkedIn
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret); // DO NOT encode manually
      params.append('redirect_uri', redirectUri);
      const requestBody = params.toString();
    console.log('LinkedIn token exchange - request body:', requestBody);

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(LINKEDIN_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: requestBody,
    });


    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      let parsedError;
      try {
        parsedError = JSON.parse(errorText);
      } catch {
        parsedError = errorText;
      }
      console.error('LinkedIn token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText,
        parsedError,
        sentRequest: {
          grant_type: 'authorization_code',
          codePreview: code ? code.substring(0, 8) + '...' + code.slice(-8) : undefined,
          client_id: clientId,
          client_secret_preview: clientSecret ? clientSecret.substring(0, 4) + '...' + clientSecret.slice(-4) : undefined,
          redirect_uri: redirectUri,
        },
      });
      return NextResponse.json(
        { error: 'Failed to exchange authorization code for tokens', linkedinError: errorText },
        { status: 400 }
      );
    }

    const tokens = await tokenResponse.json();

    console.log('LinkedIn token response:', {
      has_access_token: !!tokens.access_token,
      token_type: tokens.token_type,
      expires_in: tokens.expires_in,
      scope: tokens.scope,
    });

    if (!tokens.access_token) {
      console.error('No access token in response:', tokens);
      return NextResponse.json({ error: 'No access token received from LinkedIn' }, { status: 400 });
    }

    // Return only the access token and related info (no id_token expected)
    return NextResponse.json({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
      tokenType: tokens.token_type,
    });
  } catch (error) {
    console.error('LinkedIn token exchange error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
