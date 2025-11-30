-- Applihero Database Schema for Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles Table
-- Extends Supabase auth.users with additional profile information
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  email TEXT UNIQUE NOT NULL,
  bio TEXT,
  resume_url TEXT, -- URL to resume file in Supabase Storage
  transcript_url TEXT, -- URL to transcript file in Supabase Storage
  email_notifications BOOLEAN DEFAULT true,
  marketing_emails BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jobs Table
-- Stores job applications that users are working on
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  job_description TEXT,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'In Progress', 'Submitted', 'Archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_touched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Questions Table
-- Application questions for each job
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  status TEXT NOT NULL DEFAULT 'Not started' CHECK (status IN ('Not started', 'Draft', 'Final')),
  order_index INTEGER, -- For ordering questions within a job
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat Messages Table
-- Stores coaching chat history for each job
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job Documents Table
-- Store additional documents related to specific jobs (cover letters, etc.)
CREATE TABLE job_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('cover_letter', 'additional_essay', 'other')),
  title TEXT NOT NULL,
  content TEXT,
  document_url TEXT, -- URL if it's a file upload
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_last_touched ON jobs(last_touched_at DESC);
CREATE INDEX idx_questions_job_id ON questions(job_id);
CREATE INDEX idx_questions_order ON questions(job_id, order_index);
CREATE INDEX idx_chat_messages_job_id ON chat_messages(job_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX idx_job_documents_job_id ON job_documents(job_id);

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_documents ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Jobs policies
CREATE POLICY "Users can view own jobs"
  ON jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own jobs"
  ON jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs"
  ON jobs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own jobs"
  ON jobs FOR DELETE
  USING (auth.uid() = user_id);

-- Questions policies
CREATE POLICY "Users can view questions for their jobs"
  ON questions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = questions.job_id AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert questions for their jobs"
  ON questions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = questions.job_id AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can update questions for their jobs"
  ON questions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = questions.job_id AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete questions for their jobs"
  ON questions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = questions.job_id AND jobs.user_id = auth.uid()
  ));

-- Chat messages policies
CREATE POLICY "Users can view chat messages for their jobs"
  ON chat_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = chat_messages.job_id AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert chat messages for their jobs"
  ON chat_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = chat_messages.job_id AND jobs.user_id = auth.uid()
  ));

-- Job documents policies
CREATE POLICY "Users can view documents for their jobs"
  ON job_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = job_documents.job_id AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert documents for their jobs"
  ON job_documents FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = job_documents.job_id AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can update documents for their jobs"
  ON job_documents FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = job_documents.job_id AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete documents for their jobs"
  ON job_documents FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = job_documents.job_id AND jobs.user_id = auth.uid()
  ));

-- Functions

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_questions_updated_at
  BEFORE UPDATE ON questions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_documents_updated_at
  BEFORE UPDATE ON job_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to update last_touched_at when job-related data changes
CREATE OR REPLACE FUNCTION update_job_last_touched()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE jobs SET last_touched_at = NOW() WHERE id = NEW.job_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for last_touched_at
CREATE TRIGGER update_job_touched_on_question_change
  AFTER INSERT OR UPDATE ON questions
  FOR EACH ROW
  EXECUTE FUNCTION update_job_last_touched();

CREATE TRIGGER update_job_touched_on_chat_message
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_job_last_touched();

-- Create storage buckets (run these via Supabase dashboard or API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('resumes', 'resumes', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('transcripts', 'transcripts', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('job-documents', 'job-documents', false);
