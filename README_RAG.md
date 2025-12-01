## RAG Pipeline Overview

### Components
- `lib/rag/ingestion.ts`: Splits documents, embeds chunks via OpenAI, stores in `job_document_chunks`.
- `lib/rag/retrieval.ts`: Embeds query, calls RPC `match_job_document_chunks`, sorts & filters by similarity.
- `lib/rag/prompts.ts`: System and coach prompt builder.
- API Routes:
  - `/api/jobsessions/[id]/chat`: Retrieves context + generates assistant coaching reply, persists messages.
  - `/api/jobsessions/[id]/feedback`: Generates structured JSON feedback for a question answer.

### Required Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
TEST_USER_ID=... (for rag-test.mjs)
TEST_JOB_ID=... (optional for rag-test.mjs)
```

### Required Database Objects
Tables:
- `job_documents (id, user_id, job_id, document_type, title, content, document_url, created_at, updated_at)`
- `job_document_chunks (id, job_document_id, user_id, job_id, chunk_index, content, embedding)` Vector extension required.
- `chat_messages (id, job_id, user_id, role, content, created_at)`
- `questions` (with `question_text`, `answer_text`, `status`, etc.)

RPC Function:
`match_job_document_chunks(query_embedding vector, match_count int, match_user_id uuid, match_job_id uuid)` returning `id, content, similarity`.

### Testing Steps

**First-time Setup:**
1. Get your Supabase service role key:
   - Go to Supabase Dashboard → Settings → API
   - Copy the `service_role` key (NOT the anon key)
   - Add to `.env.local`: `SUPABASE_SERVICE_ROLE_KEY="your_key_here"`

2. Get test user and job IDs:
```bash
npm run test:get-ids
```
   - Copy the output TEST_USER_ID and TEST_JOB_ID to `.env.local`

**Run RAG Pipeline Test:**
```bash
npm run test:rag
```
3. Send chat message:
```bash
curl -X POST http://localhost:3000/api/jobsessions/$TEST_JOB_ID/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"How do I emphasize leadership?","userId":"'$TEST_USER_ID'"}'
```
4. Request feedback for a question:
```bash
curl -X POST http://localhost:3000/api/jobsessions/$QUESTION_ID/feedback \
  -H 'Content-Type: application/json' \
  -d '{"userId":"'$TEST_USER_ID'","jobId":"'$TEST_JOB_ID'"}'
```

### Notes
- Ingestion is idempotent (previous chunks for the same `job_document_id` are deleted if `replaceExisting` true).
- Retrieval sorts by similarity descending and applies an optional threshold.
- Feedback route validates JSON output structure.
- Chat route persists both user and assistant messages.

### Next Improvements
- Add route for document ingestion from uploads.
- Add guardrails / truncation for very large prompts.
- Streaming responses for chat.
