# RAG Testing Quick Start

## Prerequisites
1. **Get Supabase Service Role Key**
   - Open Supabase Dashboard: https://supabase.com/dashboard/project/qtapgokmdtuynmrziilm/settings/api
   - Scroll to "Project API keys"
   - Copy the `service_role` key (secret, starts with `eyJhbG...`)
   - Add to `.env.local`:
     ```
     SUPABASE_SERVICE_ROLE_KEY="your_actual_key_here"
     ```

2. **Get Test IDs**
   ```bash
   npm run test:get-ids
   ```
   This will output your TEST_USER_ID and TEST_JOB_ID. Add them to `.env.local`.

## Run RAG Test

```bash
npm run test:rag
```

This will:
1. Create a sample job document
2. Chunk and embed the content
3. Store embeddings in `job_document_chunks`
4. Perform a semantic search query
5. Generate an AI coaching response
6. Show any available questions for feedback testing

## Test API Endpoints Manually

**Chat endpoint:**
```bash
curl -X POST http://localhost:3000/api/jobsessions/YOUR_JOB_ID/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"How do I emphasize leadership?","userId":"YOUR_USER_ID"}'
```

**Feedback endpoint:**
```bash
curl -X POST http://localhost:3000/api/jobsessions/YOUR_QUESTION_ID/feedback \
  -H 'Content-Type: application/json' \
  -d '{"userId":"YOUR_USER_ID","jobId":"YOUR_JOB_ID"}'
```

## Troubleshooting

**"supabaseUrl is required" error:**
- Make sure `.env.local` has all required variables
- Restart your terminal/IDE after editing `.env.local`

**"match_job_document_chunks" function not found:**
- You need to create the SQL function in Supabase (see below)

**No chunks retrieved:**
- Check that `job_document_chunks` table has data
- Verify vector extension is enabled: `CREATE EXTENSION IF NOT EXISTS vector;`

## Required SQL Function

Run this in Supabase SQL Editor:

```sql
CREATE OR REPLACE FUNCTION match_job_document_chunks(
  query_embedding vector(1536),
  match_count int,
  match_user_id uuid,
  match_job_id uuid
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    jdc.id,
    jdc.content,
    1 - (jdc.embedding <=> query_embedding) AS similarity
  FROM job_document_chunks jdc
  WHERE jdc.user_id = match_user_id
    AND (match_job_id IS NULL OR jdc.job_id = match_job_id)
  ORDER BY jdc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```
