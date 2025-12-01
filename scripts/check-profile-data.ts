import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabase/client';

async function checkProfileData() {
  const userId = process.env.TEST_USER_ID || '7607ea4d-cf22-4a5d-936b-85fa9120e030';
  
  console.log(`\nChecking profile data for user: ${userId}\n`);
  
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, email, resume_url, transcript_url, resume_text, transcript_text')
    .eq('id', userId)
    .single();
  
  if (error) {
    console.error('❌ Error fetching profile:', error);
    return;
  }
  
  if (!profile) {
    console.error('❌ Profile not found');
    return;
  }
  
  console.log('📋 Profile Info:');
  console.log(`   Name: ${profile.first_name} ${profile.last_name}`);
  console.log(`   Email: ${profile.email}\n`);
  
  console.log('📄 Resume:');
  console.log(`   URL: ${profile.resume_url || 'Not uploaded'}`);
  console.log(`   Text: ${profile.resume_text ? `${profile.resume_text.length} characters` : '❌ NOT SET'}\n`);
  
  console.log('📜 Transcript:');
  console.log(`   URL: ${profile.transcript_url || 'Not uploaded'}`);
  console.log(`   Text: ${profile.transcript_text ? `${profile.transcript_text.length} characters` : '❌ NOT SET'}\n`);
  
  if (!profile.resume_text && !profile.transcript_text) {
    console.log('⚠️  WARNING: No text content found!');
    console.log('\nThe RAG model needs resume_text and transcript_text to work.');
    console.log('\nTo fix this, you need to:');
    console.log('1. Add text input fields to your profile page');
    console.log('2. Or implement PDF text extraction');
    console.log('3. Then manually populate these fields with your content\n');
  } else {
    console.log('✅ Text content found! RAG should work for this user.\n');
    
    if (profile.resume_text) {
      console.log('Resume preview (first 200 chars):');
      console.log(`"${profile.resume_text.substring(0, 200)}..."\n`);
    }
  }
}

checkProfileData().catch(console.error);
