"use client";

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;

// LinkedIn integration is disabled
export async function GET() {
  return NextResponse.json({ error: 'LinkedIn integration is currently disabled.' }, { status: 403 });
}

