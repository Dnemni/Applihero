import { config } from 'dotenv';
import { resolve } from 'path';
import { supabaseAdmin } from '../lib/supabase/client';

config({ path: resolve(process.cwd(), '.env.local') });

async function getTestIds() {
  // Get first user
  const { data: user } = await supabaseAdmin
    .from('profiles')
    .select('id, email, first_name, last_name')
    .limit(1)
    .single();

  if (!user) {
    console.error('No users found in database. Please sign up first.');
    return;
  }

  console.log('\n=== Test User Found ===');
  console.log('User ID:', user.id);
  console.log('Email:', user.email);
  console.log('Name:', user.first_name, user.last_name);

  // Get first job for this user
  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('id, job_title, company_name')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (job) {
    console.log('\n=== Test Job Found ===');
    console.log('Job ID:', job.id);
    console.log('Title:', job.job_title);
    console.log('Company:', job.company_name);
  } else {
    console.log('\nNo jobs found. You can create one or test without a job_id.');
  }

  console.log('\n=== Add to .env.local ===');
  console.log(`TEST_USER_ID="${user.id}"`);
  if (job) {
    console.log(`TEST_JOB_ID="${job.id}"`);
  }
  console.log('');
}

getTestIds().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
