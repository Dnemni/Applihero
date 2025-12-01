import 'dotenv/config';
import { supabaseAdmin, openai } from '../lib/supabase/client.js';
import { ingestJobDocument } from '../lib/rag/ingestion.js';
import { retrieveContext } from '../lib/rag/retrieval.js';
import { buildCoachPrompt, SYSTEM_COACH } from '../lib/rag/prompts.js';

async function main() {
  const userId = process.env.TEST_USER_ID;
  const jobId = process.env.TEST_JOB_ID || null;
  if (!userId) {
    console.error('Set TEST_USER_ID (and optionally TEST_JOB_ID) env vars.');
    process.exit(1);
  }

  // 1. Create a dummy job document to ingest
  const { data: doc, error: docErr } = await supabaseAdmin
    .from('job_documents')
    .insert({
      job_id: jobId,
      user_id: userId,
      document_type: 'other',
      title: 'Sample Resume Snippet',
      content: 'Experienced product manager with 5 years leading cross-functional teams. Drove 30% growth in user engagement and launched 4 major features.'
    })
    .select()
    .single();
  if (docErr) throw docErr;

  console.log('Created test document:', doc.id);

  // 2. Ingest the document content into chunk embeddings
  await ingestJobDocument({
    userId,
    jobId,
    jobDocumentId: doc.id,
    content: doc.content,
  });
  console.log('Ingestion complete.');

  // 3. Retrieve context for a sample query
  const query = 'How can I highlight product growth achievements?';
  const ctx = await retrieveContext({ userId, jobId, query });
  console.log('Retrieved context chunks:', ctx.length);
  ctx.forEach(c => console.log('-', c.content.slice(0, 80) + (c.content.length > 80 ? '…' : '')));

  // 4. Generate coaching response
  const prompt = buildCoachPrompt({ question: query, contextChunks: ctx.map(c => c.content) });
  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: SYSTEM_COACH },
      { role: 'user', content: prompt }
    ]
  });
  console.log('\nAssistant reply:\n', completion.choices[0].message.content);

  // 5. Request feedback for the newly inserted question if one exists
  const { data: firstQuestion } = await supabaseAdmin
    .from('questions')
    .select('id, question_text, answer_text')
    .eq('job_id', jobId)
    .limit(1)
    .maybeSingle();

  if (firstQuestion) {
    console.log('\nFound a question. You can POST to /api/jobsessions/' + firstQuestion.id + '/feedback with { userId, jobId }.');
  } else {
    console.log('\nNo questions found for feedback test.');
  }
}

main().catch(err => {
  console.error('RAG test script failed:', err);
  process.exit(1);
});
