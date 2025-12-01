import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabase/client';

async function listUserJobs() {
  const userId = process.env.TEST_USER_ID || '7607ea4d-cf22-4a5d-936b-85fa9120e030';
  
  console.log(`\nListing jobs for user: ${userId}\n`);
  
  const { data: jobs, error } = await supabaseAdmin
    .from('jobs')
    .select('id, company_name, job_title, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching jobs:', error);
    return;
  }
  
  if (!jobs || jobs.length === 0) {
    console.log('❌ No jobs found for this user');
    return;
  }
  
  console.log(`Found ${jobs.length} job(s):\n`);
  
  for (const job of jobs) {
    console.log(`📋 ${job.company_name} - ${job.job_title}`);
    console.log(`   ID: ${job.id}`);
    console.log(`   Created: ${new Date(job.created_at).toLocaleString()}`);
    
    // Check if documents are ingested
    const { data: docs } = await supabaseAdmin
      .from('job_documents')
      .select('id, document_type')
      .eq('job_id', job.id);
    
    console.log(`   Documents: ${docs?.length || 0} ingested`);
    if (docs && docs.length > 0) {
      console.log(`   Types: ${docs.map(d => d.document_type).join(', ')}`);
    }
    console.log('');
  }
  
  if (jobs.length > 0) {
    console.log(`\n💡 To check documents for the most recent job, run:`);
    console.log(`TEST_JOB_ID="${jobs[0].id}" npm run test:docs\n`);
  }
}

listUserJobs().catch(console.error);
