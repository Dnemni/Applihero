# Supabase Setup Guide for Applihero

This guide will help you set up Supabase for your Applihero application.

## Database Schema Overview

The database consists of 5 main tables:

1. **profiles** - User profile information (extends Supabase auth.users)
2. **jobs** - Job applications that users are working on
3. **questions** - Application questions for each job
4. **chat_messages** - Coaching chat history for each job
5. **job_documents** - Additional documents related to jobs

## Setup Steps

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Fill in your project details
4. Wait for the project to be provisioned

### 2. Run the Database Schema

1. In your Supabase dashboard, go to the SQL Editor
2. Copy the contents of `lib/supabase/schema.sql`
3. Paste and run it in the SQL Editor
4. This will create all tables, indexes, RLS policies, and triggers

### 3. Set Up Storage Buckets

In the Supabase dashboard:

1. Go to Storage
2. Create three new buckets:
   - `resumes` (private)
   - `transcripts` (private)
   - `job-documents` (private)

For each bucket, set up storage policies:

**Resumes Bucket Policies:**
```sql
-- Allow users to upload their own resume
CREATE POLICY "Users can upload own resume"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to update their own resume
CREATE POLICY "Users can update own resume"
ON storage.objects FOR UPDATE
USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to read their own resume
CREATE POLICY "Users can read own resume"
ON storage.objects FOR SELECT
USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to delete their own resume
CREATE POLICY "Users can delete own resume"
ON storage.objects FOR DELETE
USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);
```

Repeat similar policies for `transcripts` and `job-documents` buckets.

### 4. Configure Environment Variables

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in your Supabase credentials:
   - `NEXT_PUBLIC_SUPABASE_URL`: Found in Settings > API > Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Found in Settings > API > Project API keys > anon public

### 5. Install Dependencies

```bash
npm install @supabase/supabase-js
```

### 6. Set Up Authentication

In the Supabase dashboard:

1. Go to Authentication > Providers
2. Enable Email provider
3. Configure email templates if desired
4. Optional: Enable other providers (Google, GitHub, etc.)

### 7. Create Profile Trigger

To automatically create a profile when a user signs up, add this function and trigger:

```sql
-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, email_notifications, marketing_emails, active)
  VALUES (NEW.id, NEW.email, true, false, true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run the function
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## Usage Examples

### Profile Service

```typescript
import { ProfileService } from '@/lib/supabase/services';

// Get current user's profile
const profile = await ProfileService.getCurrentProfile();

// Update profile
await ProfileService.updateProfile({
  first_name: 'John',
  last_name: 'Doe',
  bio: 'Software Engineer'
});

// Upload resume
const file = // ... File object from input
await ProfileService.uploadResume(file);

// Update preferences
await ProfileService.updatePreferences(true, false);
```

### Job Service

```typescript
import { JobService } from '@/lib/supabase/services';

// Get all jobs
const jobs = await JobService.getAllJobs();

// Create a new job
const job = await JobService.createJob(
  'Software Engineer',
  'Google',
  'Full job description here...'
);

// Get job with questions
const jobWithQuestions = await JobService.getJobById(jobId);

// Update job status
await JobService.updateJobStatus(jobId, 'In Progress');

// Delete job
await JobService.deleteJob(jobId);
```

### Question Service

```typescript
import { QuestionService } from '@/lib/supabase/services';

// Get all questions for a job
const questions = await QuestionService.getQuestionsForJob(jobId);

// Create a question
await QuestionService.createQuestion(
  jobId,
  'Why do you want to work here?',
  0 // order index
);

// Save an answer
await QuestionService.saveAnswer(
  questionId,
  'I want to work here because...',
  'Draft'
);

// Update question status
await QuestionService.updateQuestionStatus(questionId, 'Final');

// Delete question
await QuestionService.deleteQuestion(questionId);
```

### Chat Service

```typescript
import { ChatService } from '@/lib/supabase/services';

// Initialize chat for a job
await ChatService.initializeChat(jobId);

// Get chat history
const messages = await ChatService.getChatHistory(jobId);

// Add user message
await ChatService.addUserMessage(jobId, 'How should I answer this?');

// Add assistant response
await ChatService.addAssistantMessage(jobId, 'Here is my suggestion...');

// Get recent messages (for LLM context)
const recentMessages = await ChatService.getRecentMessages(jobId, 10);
```

## Database Relationships

```
profiles (1) ----< jobs (many)
jobs (1) ----< questions (many)
jobs (1) ----< chat_messages (many)
jobs (1) ----< job_documents (many)
```

## Row Level Security (RLS)

All tables have RLS enabled. Users can only:
- View and modify their own profile
- View and modify jobs they created
- View and modify questions for their jobs
- View and add chat messages for their jobs
- View and modify documents for their jobs

## Data Flow

1. User signs up → Profile automatically created via trigger
2. User creates job application → Job record created
3. User adds questions → Questions linked to job
4. User chats with coach → Messages stored and linked to job
5. All updates to questions/messages automatically update job's `last_touched_at`

## TypeScript Types

All database types are defined in `lib/supabase/types.ts`. The types are automatically inferred from the schema and provide full type safety.

## Migration Notes

If you need to modify the schema later:

1. Create a new migration file in `lib/supabase/migrations/`
2. Test it locally or in a staging project
3. Apply it to production via the Supabase dashboard

## Backup & Recovery

Supabase provides automatic backups for Pro plans. For Free tier:
1. Regularly export your data via the dashboard
2. Keep migrations in version control
3. Consider implementing your own backup strategy

## Troubleshooting

### RLS Errors
If you get permission errors, check that:
1. User is authenticated
2. RLS policies are correctly applied
3. User is trying to access their own data

### Storage Errors
If file uploads fail:
1. Check bucket exists and is private
2. Verify storage policies are set up
3. Ensure file size is within limits

### Connection Issues
If you can't connect:
1. Verify environment variables are set
2. Check Supabase project is active
3. Ensure API keys are correct
