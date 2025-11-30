// Test Supabase Connection
// Run this with: node --loader ts-node/esm lib/supabase/test-connection.ts
// Or add to a test page

import { supabase } from './client';

export async function testSupabaseConnection() {
  console.log('🔍 Testing Supabase connection...\n');

  // Test 1: Check environment variables
  console.log('✓ Environment variables loaded:');
  console.log(`  - SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓' : '✗'}`);
  console.log(`  - SUPABASE_ANON_KEY: ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✓' : '✗'}\n`);

  // Test 2: Check database connection
  try {
    const { data, error } = await supabase.from('profiles').select('count').limit(1);
    
    if (error) {
      console.error('✗ Database connection failed:', error.message);
      return false;
    }
    
    console.log('✓ Database connection successful\n');
  } catch (err) {
    console.error('✗ Database connection error:', err);
    return false;
  }

  // Test 3: Check tables exist
  console.log('🔍 Checking tables...');
  const tables = ['profiles', 'jobs', 'questions', 'chat_messages', 'job_documents'];
  
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('count').limit(1);
      
      if (error) {
        console.log(`  ✗ ${table}: ${error.message}`);
      } else {
        console.log(`  ✓ ${table}`);
      }
    } catch (err: any) {
      console.log(`  ✗ ${table}: ${err.message}`);
    }
  }

  console.log('\n✅ Supabase connection test complete!');
  return true;
}

// If running directly
if (require.main === module) {
  testSupabaseConnection();
}
