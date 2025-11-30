# Database Schema Diagram

## Entity Relationship Diagram

```
┌─────────────────────────────────────┐
│           auth.users                │  (Supabase Auth)
│  - id (UUID)                        │
│  - email                            │
│  - encrypted_password               │
└─────────────────┬───────────────────┘
                  │ 1:1
                  │ (auto-created on signup)
                  ▼
┌─────────────────────────────────────┐
│           profiles                  │
│  - id (UUID) PK                     │
│  - first_name                       │
│  - last_name                        │
│  - email                            │
│  - bio                              │
│  - resume_url                       │  → Storage: resumes bucket
│  - transcript_url                   │  → Storage: transcripts bucket
│  - email_notifications (bool)      │
│  - marketing_emails (bool)          │
│  - active (bool)                    │
│  - created_at                       │
│  - updated_at                       │
└─────────────────┬───────────────────┘
                  │ 1:N
                  │
                  ▼
┌─────────────────────────────────────┐
│              jobs                   │
│  - id (UUID) PK                     │
│  - user_id (UUID) FK → profiles     │
│  - job_title                        │
│  - company_name                     │
│  - job_description                  │
│  - status (enum)                    │
│    • Draft                          │
│    • In Progress                    │
│    • Submitted                      │
│    • Archived                       │
│  - created_at                       │
│  - updated_at                       │
│  - last_touched_at (auto-updated)   │
└──────┬──────────┬──────────────┬────┘
       │          │              │
       │ 1:N      │ 1:N          │ 1:N
       ▼          ▼              ▼
┌──────────┐ ┌──────────┐ ┌──────────────┐
│questions │ │chat_msgs │ │job_documents │
├──────────┤ ├──────────┤ ├──────────────┤
│id (PK)   │ │id (PK)   │ │id (PK)       │
│job_id FK │ │job_id FK │ │job_id FK     │
│question_ │ │role      │ │document_type │
│ text     │ │ • user   │ │ • cover_     │
│answer_   │ │ • assist │ │   letter     │
│ text     │ │ • system │ │ • essay      │
│status    │ │content   │ │ • other      │
│ • Not    │ │created_at│ │title         │
│   started│ └──────────┘ │content       │
│ • Draft  │              │document_url  │
│ • Final  │              │created_at    │
│order_    │              │updated_at    │
│ index    │              └──────────────┘
│created_at│
│updated_at│
└──────────┘
```

## Table Details

### profiles
**Purpose:** Store user profile information extending Supabase auth
- Links 1:1 with auth.users
- Contains personal info, resume/transcript links, preferences
- Soft delete with `active` flag

### jobs
**Purpose:** Track job applications user is working on
- Links to user's profile
- Contains job details and current status
- `last_touched_at` auto-updates when related data changes
- Deleting a job cascades to all related data

### questions
**Purpose:** Application questions for each job
- Links to parent job
- Stores both question text and user's answer
- Has status tracking (Not started → Draft → Final)
- `order_index` allows custom ordering
- Updates parent job's `last_touched_at` on change

### chat_messages
**Purpose:** Store coaching conversation history
- Links to parent job
- Records role (user/assistant/system) and content
- Chronologically ordered
- Updates parent job's `last_touched_at` on insert

### job_documents
**Purpose:** Additional documents for job applications
- Links to parent job
- Can store text content or file URLs
- Typed (cover letter, essay, other)
- Useful for cover letters, additional essays

## Data Access Patterns

### Dashboard View
```sql
SELECT j.*, 
       COUNT(q.id) as question_count
FROM jobs j
LEFT JOIN questions q ON q.job_id = j.id
WHERE j.user_id = current_user_id
GROUP BY j.id
ORDER BY j.last_touched_at DESC;
```

### Job Workspace View
```sql
-- Get job with all questions
SELECT j.*, 
       json_agg(q.*) as questions
FROM jobs j
LEFT JOIN questions q ON q.job_id = j.id
WHERE j.id = job_id
GROUP BY j.id;
```

### Chat View
```sql
-- Get recent chat history
SELECT * FROM chat_messages
WHERE job_id = job_id
ORDER BY created_at DESC
LIMIT 50;
```

## Storage Structure

```
resumes/
  └── {user_id}/
      └── resume.pdf

transcripts/
  └── {user_id}/
      └── transcript.pdf

job-documents/
  └── {job_id}/
      ├── cover_letter.pdf
      ├── essay_1.pdf
      └── essay_2.pdf
```

## Security Model

### Row Level Security (RLS)

Every table has policies that ensure:
1. Users can only see their own data
2. Users can only modify their own data
3. Related data access is verified through joins

Example: Questions RLS
```sql
-- User can only access questions for jobs they own
CREATE POLICY "Access own job questions"
ON questions
USING (
  EXISTS (
    SELECT 1 FROM jobs 
    WHERE jobs.id = questions.job_id 
    AND jobs.user_id = auth.uid()
  )
);
```

## Indexes for Performance

```sql
-- Job lookups by user and status
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_last_touched ON jobs(last_touched_at DESC);

-- Question lookups by job
CREATE INDEX idx_questions_job_id ON questions(job_id);
CREATE INDEX idx_questions_order ON questions(job_id, order_index);

-- Chat message lookups
CREATE INDEX idx_chat_messages_job_id ON chat_messages(job_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);
```

## Triggers & Automation

### 1. Auto-update timestamps
```sql
-- Automatically set updated_at on row changes
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2. Auto-update last_touched_at
```sql
-- Update job's last_touched_at when questions change
CREATE TRIGGER update_job_touched_on_question_change
  AFTER INSERT OR UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION update_job_last_touched();
```

### 3. Auto-create profile on signup
```sql
-- Create profile when user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

## Cascade Deletes

When you delete a job, all related data is automatically deleted:
- All questions for that job
- All chat messages for that job
- All documents for that job

When you delete a profile (or user):
- All jobs owned by that user
- All questions for those jobs (via jobs cascade)
- All chat messages for those jobs (via jobs cascade)
- All documents for those jobs (via jobs cascade)
