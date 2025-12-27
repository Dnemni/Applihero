import { getServerSupabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const supabase = getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'linkedin_id, linkedin_name, linkedin_headline, linkedin_avatar_url, linkedin_connected_at, linkedin_raw'
    )
    .eq('id', user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data?.linkedin_id) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    name: data.linkedin_name,
    headline: data.linkedin_headline,
    picture: data.linkedin_avatar_url,
    connectedAt: data.linkedin_connected_at,
    raw: data.linkedin_raw,
  });
}
