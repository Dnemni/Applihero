import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabase/client';

async function verifySchema() {
  console.log('\n🔍 Checking database schema...\n');
  
  const userId = process.env.TEST_USER_ID || '7607ea4d-cf22-4a5d-936b-85fa9120e030';
  
  // Try to select all columns from profiles
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) {
    console.error('❌ Error fetching profile:', error);
    return;
  }
  
  console.log('✅ Profile found for user:', userId);
  console.log('\n📋 Available columns:');
  
  const columns = Object.keys(data || {});
  columns.forEach(col => {
    const value = data[col];
    const type = typeof value;
    const preview = type === 'string' && value.length > 50 
      ? `${value.substring(0, 50)}...` 
      : value;
    console.log(`   - ${col}: ${type} ${type === 'string' ? `(${value?.length || 0} chars)` : ''}`);
  });
  
  console.log('\n🎯 Critical columns for RAG:');
  console.log(`   resume_text: ${columns.includes('resume_text') ? '✅ EXISTS' : '❌ MISSING'}`);
  console.log(`   transcript_text: ${columns.includes('transcript_text') ? '✅ EXISTS' : '❌ MISSING'}`);
  
  if (!columns.includes('resume_text') || !columns.includes('transcript_text')) {
    console.log('\n⚠️  COLUMNS ARE MISSING!');
    console.log('\n📝 Run this SQL in Supabase SQL Editor:\n');
    console.log('ALTER TABLE profiles');
    console.log('ADD COLUMN IF NOT EXISTS resume_text TEXT,');
    console.log('ADD COLUMN IF NOT EXISTS transcript_text TEXT;\n');
  } else {
    console.log('\n✅ Schema looks good!');
    console.log(`\nResume text: ${data.resume_text ? `${data.resume_text.length} characters` : 'NULL'}`);
    console.log(`Transcript text: ${data.transcript_text ? `${data.transcript_text.length} characters` : 'NULL'}\n`);
  }
}

verifySchema().catch(console.error);
