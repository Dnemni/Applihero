import { createClient } from '@supabase/supabase-js';
import { Database } from './types';
import OpenAI from "openai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Client for browser usage
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient<Database>(supabaseUrl, supabaseAnonKey)
  : null as any;

// Server-side client (for API routes)
export const getServerSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase env vars');
  
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false
    }
  });
};

// Lazy initialization for OpenAI client
let _openai: OpenAI | null = null;

export const openai = new Proxy({} as OpenAI, {
  get(target, prop) {
    if (!_openai) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('Missing OPENAI_API_KEY');
      }
      _openai = new OpenAI({ apiKey });
    }
    return (_openai as any)[prop];
  }
});

// Lazy initialization for admin client
let _supabaseAdmin: ReturnType<typeof createClient> | null = null;

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient>, {
  get(target, prop) {
    if (!_supabaseAdmin) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      }
      _supabaseAdmin = createClient(url, key);
    }
    return (_supabaseAdmin as any)[prop];
  }
});

