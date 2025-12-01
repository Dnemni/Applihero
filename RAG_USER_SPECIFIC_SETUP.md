# RAG Model Setup - Making it User & Job Specific

## Problem
The RAG model doesn't have access to your resume, transcript, or job description, so it can't provide personalized coaching based on your actual background.

## Solution Implemented

### 1. Created Ingestion API Endpoint
**File**: `/app/api/jobs/[id]/ingest/route.ts`

This endpoint automatically ingests three types of documents when a job is created:
- **Resume** (from `profiles.resume_text`)
- **Transcript** (from `profiles.transcript_text`)  
- **Job Description** (from the job creation form)

### 2. Updated Job Creation Flow
**File**: `/app/dashboard/new/page.tsx`

Modified `handleSubmit()` to:
1. Create the job
2. **Automatically call the ingestion API** to populate the RAG vector database
3. Navigate to the job page

This ensures every new job has its own RAG context with your documents.

### 3. How It Works Now

```
User creates job → Job saved to DB → Ingestion API called →
  ├─ Resume copied to job_documents table
  ├─ Transcript copied to job_documents table  
  └─ Job description copied to job_documents table
    ↓
Each document chunked & embedded →
  Vector chunks stored in job_document_chunks →
    RAG-powered chat can now answer questions about your background!
```

## ⚠️ Missing Piece: Database Schema

Your `profiles` table currently has:
- `resume_url` (file path)
- `transcript_url` (file path)

But **NOT**:
- `resume_text` (text content) ❌
- `transcript_text` (text content) ❌

## Solution Options

### Option 1: Add Text Columns to Database (Recommended)

Run this SQL in your Supabase SQL Editor:

\`\`\`sql
-- Add text columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS resume_text TEXT,
ADD COLUMN IF NOT EXISTS transcript_text TEXT;

-- Update the types
COMMENT ON COLUMN profiles.resume_text IS 'Full text content of resume for RAG';
COMMENT ON COLUMN profiles.transcript_text IS 'Full text content of transcript for RAG';
\`\`\`

Then update your TypeScript types:

\`\`\`typescript
// In lib/supabase/types.ts - profiles table Row
resume_url: string | null;
transcript_url: string | null;
resume_text: string | null;      // ADD THIS
transcript_text: string | null;  // ADD THIS
\`\`\`

### Option 2: Manual Text Input (Quick Fix)

Add text areas to the profile page where users can paste their resume/transcript text directly.

## Testing the RAG Model

Once you have `resume_text` and `transcript_text` populated:

1. **Create a new job** on `/dashboard/new`
2. **Wait ~2-3 seconds** for ingestion to complete
3. **Go to the job page** and open the chat
4. **Ask specific questions**:
   - "What school do I go to?"
   - "What's my GPA?"
   - "Tell me about my work experience"
   - "What skills do I have relevant to this role?"

The AI should now answer based on YOUR actual documents!

## Verification Commands

### Check if documents were ingested:
\`\`\`bash
npx tsx scripts/check-job-documents.ts
\`\`\`

### Check if chunks were created:
\`\`\`sql
SELECT 
  jd.title,
  COUNT(jdc.id) as chunk_count
FROM job_documents jd
LEFT JOIN job_document_chunks jdc ON jd.id = jdc.job_document_id
WHERE jd.job_id = 'your-job-id'
GROUP BY jd.id, jd.title;
\`\`\`

### Manually test ingestion for existing job:
\`\`\`bash
curl -X POST http://localhost:3000/api/jobs/YOUR_JOB_ID/ingest \\
  -H "Content-Type: application/json" \\
  -d '{"userId": "YOUR_USER_ID"}'
\`\`\`

## What Each Document Provides

### Resume → Answers questions about:
- Work experience
- Projects
- Technical skills
- Education overview
- Accomplishments

### Transcript → Answers questions about:
- Specific courses taken
- GPA and academic performance  
- Major/minor
- Academic achievements
- School name

### Job Description → Answers questions about:
- Required skills for the role
- Company expectations
- How your experience aligns
- What to emphasize in responses

## Current Status

✅ **Implemented**:
- Ingestion API endpoint (`/api/jobs/[id]/ingest`)
- Automatic ingestion on job creation
- Document chunking and embedding
- Vector search and retrieval
- RAG-powered chat responses

❌ **Needs Setup**:
- Database columns for `resume_text` and `transcript_text`
- Profile page UI to input/edit text content
- Or PDF text extraction library

## Next Steps

1. **Add the database columns** (run the SQL above)
2. **Update TypeScript types** to include the new fields
3. **Add text fields to profile page** OR implement PDF parsing
4. **Populate your resume/transcript text**
5. **Create a new job** to test the full flow
6. **Ask the chat specific questions** about your background

Once this is done, the RAG model will be fully functional and personalized to each user and job! 🎯
