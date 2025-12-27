import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
}

const client = createClient(supabaseUrl, supabaseServiceRoleKey);

const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_IDENTITY_ME_URL = 'https://api.linkedin.com/rest/identityMe';

// Verified on LinkedIn /identityMe docs call out a required version header.
// For Plus tier, doc mentions 202510.03; for Dev/Lite, check release notes if needed. :contentReference[oaicite:3]{index=3}
const LINKEDIN_VERSION = '202510.03';

// Helpers to safely pull localized names
function pickLocalizedName(multiLocale: any): string | null {
  if (!multiLocale) return null;

  // Common pattern: { localized: { "en_US": "Dhruv" }, preferredLocale: { language: "en", country: "US" } }
  const localized = multiLocale.localized;
  const preferred = multiLocale.preferredLocale;

  if (localized && preferred?.language && preferred?.country) {
    const key = `${preferred.language}_${preferred.country}`;
    if (localized[key]) return localized[key];
  }

  // fallback to first localized entry
  if (localized && typeof localized === 'object') {
    const first = Object.values(localized)[0];
    if (typeof first === 'string') return first;
  }

  // fallback if API shape changes
  if (typeof multiLocale === 'string') return multiLocale;

  return null;
}

function extractProfilePictureUrl(basicInfo: any): string | null {
  // Docs say profilePicture returns cropped image URL + expiry. :contentReference[oaicite:4]{index=4}
  // Exact field names can vary by tier/version; try a few plausible paths and fallback to null.
  const pic = basicInfo?.profilePicture;
  if (!pic) return null;

  return (
    pic.croppedImageUrl ||
    pic.croppedImage?.url ||
    pic.image?.url ||
    pic.url ||
    null
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
      return NextResponse.json(
        { error: 'No authorization code received from LinkedIn' },
        { status: 400 }
      );
    }

    // ⚠️ You’re currently using state as userId.
    // That works for a prototype, but it’s spoofable. Prefer a signed state or store userId server-side.
    const userId = state;
    if (!userId) {
      return NextResponse.json({ error: 'Missing user id in state' }, { status: 400 });
    }

    const clientId = (process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID || '').trim();
    const clientSecret = (process.env.LINKEDIN_CLIENT_SECRET || '').trim();
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim();

    if (!clientId || !clientSecret || !appUrl) {
      return NextResponse.json(
        {
          error: 'Missing LinkedIn env vars',
          details: {
            hasClientId: !!clientId,
            hasClientSecret: !!clientSecret,
            hasAppUrl: !!appUrl,
          },
        },
        { status: 500 }
      );
    }

    // Exchange code for access token
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('redirect_uri', `${appUrl}/api/profile/linkedin-callback`);

    const tokenRes = await fetch(LINKEDIN_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      return NextResponse.json(
        { error: 'Failed to exchange code for access token', details: errorText },
        { status: 400 }
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token as string | undefined;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'LinkedIn did not return an access token', details: tokenData },
        { status: 400 }
      );
    }

    // Fetch LinkedIn profile using Verified on LinkedIn Profile Details API (/identityMe)
    // Required header: LinkedIn-Version (value from docs/release notes). :contentReference[oaicite:5]{index=5}
    const identityRes = await fetch(LINKEDIN_IDENTITY_ME_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'LinkedIn-Version': LINKEDIN_VERSION,
        // Many /rest APIs also require Rest.li protocol header; harmless if not required.
        // (LinkedIn docs for other /rest APIs commonly require this.)
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });

    if (!identityRes.ok) {
      const errorText = await identityRes.text();
      return NextResponse.json(
        { error: 'Failed to fetch LinkedIn identityMe', details: errorText },
        { status: 400 }
      );
    }

    const identityData = await identityRes.json();

    // identityData shape per docs (common fields):
    // identityData.id
    // identityData.basicInfo.firstName / lastName (MultiLocaleString)
    // identityData.basicInfo.primaryEmailAddress
    // identityData.basicInfo.profileUrl
    // identityData.basicInfo.profilePicture (cropped URL + expiry) :contentReference[oaicite:6]{index=6}
    const basicInfo = identityData.basicInfo || {};

    const firstName = pickLocalizedName(basicInfo.firstName) || '';
    const lastName = pickLocalizedName(basicInfo.lastName) || '';
    const fullName = `${firstName} ${lastName}`.trim() || null;

    const primaryEmail =
      basicInfo.primaryEmailAddress ||
      null;

    const profileUrl =
      basicInfo.profileUrl ||
      null;

    const pictureUrl =
      extractProfilePictureUrl(basicInfo);

    // Store LinkedIn data in Supabase profile table (update by id)
    const { error: updateError } = await client
      .from('profiles')
      .update({
        linkedin_connected: true,
        linkedin_id: identityData.id ?? null,
        linkedin_name: fullName,
        linkedin_profile_url: profileUrl,
        linkedin_picture: pictureUrl,
        linkedin_email: primaryEmail,
        linkedin_raw: identityData,
        linkedin_last_refreshed_at: identityData.lastRefreshedAt ?? null,
      })
      .eq('id', userId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update profile with LinkedIn data', details: updateError.message },
        { status: 500 }
      );
    }

    const redirectBase =
      (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim();

    return NextResponse.redirect(`${redirectBase}/profile?linkedin=success`);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
