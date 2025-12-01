import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabase/client';

async function checkJobDocuments() {
  const jobId = process.env.TEST_JOB_ID || '1e77fa12-4cae-480f-9b26-f84f1c0ace78';
  
  console.log(`\nChecking documents for job: ${jobId}\n`);
  
  // Get all documents for this job
  const { data: documents, error: docError } = await supabaseAdmin
    .from('job_documents')
    .select('*')
    .eq('job_id', jobId);
  
  if (docError) {
    console.error('Error fetching documents:', docError);
    return;
  }
  
  console.log(`Found ${documents?.length || 0} documents:\n`);
  
  for (const doc of documents || []) {
    console.log(`📄 ${doc.document_type}: ${doc.title}`);
    console.log(`   Content length: ${doc.content?.length || 0} characters`);
    console.log(`   Created: ${new Date(doc.created_at).toLocaleString()}\n`);
    
    // Get chunk count for this document
    const { data: chunks, error: chunkError } = await supabaseAdmin
      .from('job_document_chunks')
      .select('id')
      .eq('job_document_id', doc.id);
    
    if (!chunkError) {
      console.log(`   📊 ${chunks?.length || 0} chunks created\n`);
    }
  }
  
  // Get total chunk count
  const { data: allChunks, error: allChunksError } = await supabaseAdmin
    .from('job_document_chunks')
    .select('id, content')
    .eq('job_id', jobId);
  
  if (!allChunksError) {
    console.log(`\n✅ Total chunks in vector database: ${allChunks?.length || 0}`);
    
    if (allChunks && allChunks.length > 0) {
      console.log(`\nSample chunk:`);
      console.log(`"${allChunks[0].content.substring(0, 150)}..."\n`);
    }
  }
  
  if (!documents || documents.length === 0) {
    console.log('\n⚠️  No documents found!');
    console.log('To ingest documents for this job, run:');
    console.log(`curl -X POST http://localhost:3000/api/jobs/${jobId}/ingest \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"userId": "${process.env.TEST_USER_ID}"}'`);
  }
}

checkJobDocuments().catch(console.error);
