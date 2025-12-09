-- Combined migration: Create resume_versions table with current_url field
-- Run this in your Supabase SQL Editor if the table doesn't exist yet

-- Create resume_versions table for storing multiple optimized resume versions per job
CREATE TABLE IF NOT EXISTS resume_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  optimized_text TEXT NOT NULL,
  original_file_url TEXT,
  current_url TEXT,
  feedback_score INTEGER,
  feedback_text JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comment to describe the current_url column
COMMENT ON COLUMN resume_versions.current_url IS 'URL of the current version resume PDF. Initially copied from profile.resume_url, then updated with new version URLs on each save.';

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_resume_versions_job_id ON resume_versions(job_id);
CREATE INDEX IF NOT EXISTS idx_resume_versions_user_id ON resume_versions(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_versions_created_at ON resume_versions(created_at);
CREATE INDEX IF NOT EXISTS idx_resume_versions_current_url ON resume_versions(current_url);

-- Enable RLS
ALTER TABLE resume_versions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own resume versions" ON resume_versions;
DROP POLICY IF EXISTS "Users can insert own resume versions" ON resume_versions;
DROP POLICY IF EXISTS "Users can update own resume versions" ON resume_versions;
DROP POLICY IF EXISTS "Users can delete own resume versions" ON resume_versions;

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
