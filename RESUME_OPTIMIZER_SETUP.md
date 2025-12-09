# Resume Optimizer Setup Guide

## Issues Fixed

1. ✅ **JobService method error**: Changed from `JobService.getJobsByUserId()` to `JobService.getAllJobs()`
2. ✅ **Type mismatch**: Changed state type from `JobWithQuestions[]` to `Job[]` since we don't need full question details
3. ✅ **Import optimization**: Consolidated openai import in suggestions endpoint
4. ✅ **Supabase types**: Added `resume_versions` table type definitions

## Database Setup

The Resume Optimizer requires a new Supabase table. Run the migration:

### Option 1: Using Supabase CLI (Recommended)

```bash
# Copy migration to supabase/migrations folder (already done)
# Then sync to database
supabase link --project-ref <your-project-ref>
supabase db push
```

### Option 2: Manual SQL in Supabase Dashboard

1. Go to your Supabase project at https://app.supabase.com
2. Navigate to SQL Editor
3. Create a new query and run the SQL from `supabase/migrations/20250205_create_resume_versions.sql`:

```sql
-- Create resume_versions table for storing multiple optimized resume versions per job
CREATE TABLE resume_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  optimized_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups by job_id and user_id
CREATE INDEX idx_resume_versions_job_id ON resume_versions(job_id);
CREATE INDEX idx_resume_versions_user_id ON resume_versions(user_id);
CREATE INDEX idx_resume_versions_created_at ON resume_versions(created_at);

-- Enable RLS
ALTER TABLE resume_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own resume versions
CREATE POLICY "Users can view own resume versions"
  ON resume_versions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own resume versions"
  ON resume_versions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own resume versions"
  ON resume_versions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own resume versions"
  ON resume_versions FOR DELETE
  USING (auth.uid() = user_id);
```

## Running the Application

```bash
npm run dev
```

Then navigate to:
- Dashboard: http://localhost:3000/dashboard
- Resume Optimizer: http://localhost:3000/resume-optimizer

## Feature Walkthrough

### 1. Job Selection
- Left sidebar shows all your job applications
- Click to select a job
- Resume automatically loads (from profile if no optimized version exists)

### 2. View Mode (Default)
- Text-based display of your resume
- Clean, readable format
- Shows your baseline resume for the selected job

### 3. Edit & Suggestions
- Click "Edit & Suggestions" tab
- Click "Get AI Suggestions" button
- AI generates 6-8 targeted suggestions based on:
  - Job title, company, and description
  - Your resume content
  - Your background (bio, transcript, etc.) via RAG

### 4. Editing
- All suggestions appear above the textarea
- Make edits directly in the textarea
- Changes are live (not auto-saved)

### 5. Save & Download
- **Save Version**: Creates a new timestamped version record (allows multiple versions per job)
- **Download PDF**: Generates a PDF of the current resume

## API Endpoints

### POST /api/resume-optimizer/suggestions
Generates AI suggestions for resume optimization.

**Request:**
```json
{
  "jobId": "uuid",
  "jobTitle": "string",
  "company": "string",
  "jobDescription": "string",
  "resumeText": "string",
  "userId": "uuid"
}
```

**Response:**
```json
{
  "suggestions": [
    "Experience section → Add quantified results to project work",
    "Skills section → Emphasize cloud technologies mentioned in job",
    ...
  ]
}
```

### GET /api/resume-optimizer/[id]
Loads the latest optimized resume version for a job.

**Query Parameters:**
- `userId` (required): UUID of the user

**Response:**
```json
{
  "id": "uuid",
  "job_id": "uuid",
  "user_id": "uuid",
  "original_text": "string",
  "optimized_text": "string",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### POST /api/resume-optimizer/[id]
Saves a new resume version for a job.

**Request:**
```json
{
  "userId": "uuid",
  "originalText": "string",
  "optimizedText": "string"
}
```

**Response:**
```json
{
  "id": "uuid",
  "job_id": "uuid",
  "user_id": "uuid",
  "original_text": "string",
  "optimized_text": "string",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

## Troubleshooting

### "No jobs found"
- Navigate to Dashboard and create at least one job application
- Come back to Resume Optimizer

### "No resume available"
- Upload or paste a resume in your profile
- Resumes are loaded from `profile.resume_text`

### "Failed to generate suggestions"
- Check that your OpenAI API key is configured
- Verify the job has a title, company, and description
- Check browser console for detailed error messages

### Database connection errors
- Verify the `resume_versions` table exists in Supabase
- Check that RLS policies are correctly applied
- Confirm your user is authenticated before accessing the page

## Next Steps (Optional Enhancements)

1. **Version History View**: Show all saved resume versions for a job with timestamps
2. **Resume Upload**: Allow users to upload different base resumes
3. **Side-by-side Comparison**: Compare original vs optimized resume
4. **Keyword Tracking**: Show which job keywords are in your resume
5. **Batch Optimization**: Generate suggestions for multiple jobs at once
