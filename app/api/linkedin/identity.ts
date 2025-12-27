import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/linkedin/identity?access_token=...
 * Fetches LinkedIn identity info using the verification product API.
 */
export async function GET(request: NextRequest) {
  const accessToken = request.nextUrl.searchParams.get('access_token');
  if (!accessToken) {
    return NextResponse.json({ error: 'Missing access_token' }, { status: 400 });
  }

  const response = await fetch('https://api.linkedin.com/rest/identityMe', {
    method: 'GET',
    headers: {
      'LinkedIn-Version': '202510.03',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json({ error: 'Failed to fetch identity info', details: errorText }, { status: 400 });
  }

  const data = await response.json();
  return NextResponse.json(data);
}
