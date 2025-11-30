# Supabase Quick Reference

## 🚀 Import Services

```typescript
import { 
  ProfileService, 
  JobService, 
  QuestionService, 
  ChatService 
} from '@/lib/supabase/services';
```

## 👤 Profile Operations

```typescript
// Get current user's profile
const profile = await ProfileService.getCurrentProfile();

// Update profile
await ProfileService.updateProfile({
  first_name: 'John',
  last_name: 'Doe',
  bio: 'Software Engineer'
});

// Upload resume
const resumeFile = event.target.files[0];
const resumeUrl = await ProfileService.uploadResume(resumeFile);

// Upload transcript
const transcriptUrl = await ProfileService.uploadTranscript(transcriptFile);

// Update preferences
await ProfileService.updatePreferences(
  emailNotifications: true,
  marketingEmails: false
);

// Deactivate account
await ProfileService.deactivateAccount();
```

## 💼 Job Operations

```typescript
// Get all jobs
const jobs = await JobService.getAllJobs();

// Get job with questions
const job = await JobService.getJobById(jobId);

// Create job
const newJob = await JobService.createJob(
  'Software Engineer',
  'Google',
  'Job description...'
);

// Update job
await JobService.updateJob(jobId, {
  job_title: 'Senior Software Engineer',
  status: 'In Progress'
});

// Update just the status
await JobService.updateJobStatus(jobId, 'Submitted');

// Delete job (cascades to questions, messages, documents)
await JobService.deleteJob(jobId);

// Get dashboard stats
const stats = await JobService.getJobStats();
// Returns: { total, draft, inProgress, submitted }
```

## ❓ Question Operations

```typescript
// Get all questions for a job
const questions = await QuestionService.getQuestionsForJob(jobId);

// Get single question
const question = await QuestionService.getQuestionById(questionId);

// Create question
const newQuestion = await QuestionService.createQuestion(
  jobId,
  'Why do you want to work here?',
  0 // order index (optional)
);

// Update question
await QuestionService.updateQuestion(questionId, {
  question_text: 'Updated question text',
  answer_text: 'My answer...',
  status: 'Draft'
});

// Update just the question text
await QuestionService.updateQuestionText(
  questionId,
  'New question text'
);

// Save answer (with optional status update)
await QuestionService.saveAnswer(
  questionId,
  'My answer text',
  'Draft' // optional status
);

// Update just the status
await QuestionService.updateQuestionStatus(questionId, 'Final');

// Delete question
await QuestionService.deleteQuestion(questionId);

// Reorder questions
await QuestionService.reorderQuestions(jobId, [
  'question-id-1',
  'question-id-2',
  'question-id-3'
]);

// Get question stats
const stats = await QuestionService.getQuestionStats(jobId);
// Returns: { total, notStarted, draft, final }
```

## 💬 Chat Operations

```typescript
// Initialize chat with greeting (only if empty)
await ChatService.initializeChat(jobId);

// Get full chat history
const messages = await ChatService.getChatHistory(jobId);

// Add user message
await ChatService.addUserMessage(jobId, 'How should I answer this?');

// Add assistant response
await ChatService.addAssistantMessage(jobId, 'Here is my suggestion...');

// Add any message
await ChatService.addMessage(jobId, 'system', 'Context: ...');

// Get recent messages (for LLM context)
const recentMessages = await ChatService.getRecentMessages(jobId, 10);

// Get message count
const count = await ChatService.getMessageCount(jobId);

// Clear chat history
await ChatService.clearChatHistory(jobId);
```

## 🎯 Common Patterns

### Loading Data in Components

```typescript
'use client';

import { useState, useEffect } from 'react';
import { JobService } from '@/lib/supabase/services';

export function JobList() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    setLoading(true);
    const data = await JobService.getAllJobs();
    setJobs(data);
    setLoading(false);
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {jobs.map(job => (
        <div key={job.id}>{job.job_title}</div>
      ))}
    </div>
  );
}
```

### Creating New Records

```typescript
async function handleSubmit(e: FormEvent) {
  e.preventDefault();
  
  const job = await JobService.createJob(
    jobTitle,
    companyName,
    jobDescription
  );

  if (job) {
    router.push(`/jobs/${job.id}`);
  }
}
```

### Updating Records

```typescript
async function handleSave() {
  const updated = await QuestionService.saveAnswer(
    selectedQuestion.id,
    answerText,
    'Draft'
  );

  if (updated) {
    // Show success message
    toast.success('Answer saved!');
  }
}
```

### Error Handling

```typescript
async function deleteJob(jobId: string) {
  if (!confirm('Delete this job?')) return;

  const success = await JobService.deleteJob(jobId);

  if (success) {
    // Refresh list
    await loadJobs();
    toast.success('Job deleted');
  } else {
    toast.error('Failed to delete job');
  }
}
```

## 🔐 Authentication

```typescript
import { supabase } from '@/lib/supabase/client';

// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123'
});

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
});

// Sign out
await supabase.auth.signOut();

// Get current user
const { data: { user } } = await supabase.auth.getUser();

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log(event, session);
});
```

## 📁 File Upload Pattern

```typescript
async function handleResumeUpload(file: File) {
  if (file.type !== 'application/pdf') {
    alert('Please upload a PDF file');
    return;
  }

  setUploading(true);
  const url = await ProfileService.uploadResume(file);
  setUploading(false);

  if (url) {
    setResumeUrl(url);
    toast.success('Resume uploaded!');
  } else {
    toast.error('Upload failed');
  }
}
```

## 📊 Dashboard Stats Pattern

```typescript
useEffect(() => {
  loadStats();
}, []);

async function loadStats() {
  const [jobs, jobStats, questionStats] = await Promise.all([
    JobService.getAllJobs(),
    JobService.getJobStats(),
    // Get question stats for first job
    jobs[0] ? QuestionService.getQuestionStats(jobs[0].id) : null
  ]);

  setStats({
    totalJobs: jobStats.total,
    inProgress: jobStats.inProgress,
    questionsAnswered: questionStats?.final || 0
  });
}
```

## 🔄 Real-time Updates (Optional)

```typescript
import { supabase } from '@/lib/supabase/client';

useEffect(() => {
  // Subscribe to job changes
  const subscription = supabase
    .channel('jobs-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'jobs'
      },
      (payload) => {
        console.log('Change received!', payload);
        loadJobs(); // Refresh data
      }
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
}, []);
```

## 🎨 TypeScript Types

```typescript
import type { 
  Profile, 
  Job, 
  Question, 
  ChatMessage,
  JobStatus,
  QuestionStatus 
} from '@/lib/supabase/types';

// Use in component state
const [job, setJob] = useState<Job | null>(null);
const [questions, setQuestions] = useState<Question[]>([]);
const [status, setStatus] = useState<JobStatus>('Draft');
```

## ⚡ Performance Tips

1. **Parallel Requests:**
```typescript
// Good - parallel
const [jobs, profile] = await Promise.all([
  JobService.getAllJobs(),
  ProfileService.getCurrentProfile()
]);

// Bad - sequential
const jobs = await JobService.getAllJobs();
const profile = await ProfileService.getCurrentProfile();
```

2. **Pagination for Large Lists:**
```typescript
// In your service, add:
const { data } = await supabase
  .from('jobs')
  .select('*')
  .range(0, 9); // First 10 items
```

3. **Select Only Needed Columns:**
```typescript
// Instead of select('*')
const { data } = await supabase
  .from('jobs')
  .select('id, job_title, company_name, status')
  .eq('user_id', userId);
```

## 🐛 Debugging

```typescript
// Enable debug logging
import { supabase } from '@/lib/supabase/client';

// Check auth status
const { data: { session } } = await supabase.auth.getSession();
console.log('Session:', session);

// Check if RLS is blocking
const { data, error } = await supabase
  .from('jobs')
  .select('*');
console.log('Data:', data);
console.log('Error:', error); // Look for RLS-related errors
```

## 📱 API Routes

```typescript
// app/api/jobs/route.ts
import { getServerSupabase } from '@/lib/supabase/client';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = getServerSupabase();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', user.id);

  return NextResponse.json({ jobs: data });
}
```

## 🔗 Quick Links

- [Supabase Dashboard](https://supabase.com/dashboard)
- [Setup Guide](./lib/supabase/README.md)
- [Schema Diagram](./DATABASE_SCHEMA.md)
- [Full Documentation](./SUPABASE_SETUP.md)
