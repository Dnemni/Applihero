import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabase/client';

async function checkJobAndQuestions() {
  const jobId = '1e77fa12-4cae-480f-9b26-f84f1c0ace78';
  
  const { data: questions, error } = await supabaseAdmin
    .from('questions')
    .select('id, question_text, job_id')
    .eq('job_id', jobId);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`\nFound ${questions.length} questions for job ${jobId}:\n`);
  questions.forEach((q, i) => {
    console.log(`${i + 1}. ID: ${q.id}`);
    console.log(`   Question: ${q.question_text}\n`);
  });
  
  if (questions.length > 0) {
    console.log(`\nYou can test chat with job ID: ${jobId}`);
    console.log(`curl -X POST http://localhost:3000/api/jobsessions/${jobId}/chat \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"message": "test", "userId": "7607ea4d-cf22-4a5d-936b-85fa9120e030"}'`);
  }
}

checkJobAndQuestions().catch(console.error);
