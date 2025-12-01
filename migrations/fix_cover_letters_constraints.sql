-- Fix cover_letters table foreign key constraints
-- The table was created with an incorrect constraint where cover_letters.id references profiles.id
-- This migration drops the wrong constraint and ensures correct schema

-- First, try to drop the incorrect constraint if it exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'cover_letters_id_fkey'
  ) THEN
    ALTER TABLE cover_letters DROP CONSTRAINT cover_letters_id_fkey;
  END IF;
END $$;

-- Drop existing table and recreate with correct constraints
DROP TABLE IF EXISTS cover_letters CASCADE;

-- Create cover_letters table with correct constraints
CREATE TABLE cover_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  selected_template TEXT,
  style_settings JSONB DEFAULT '{
    "tone": "professional",
    "formality": 70,
    "length": "standard",
    "focus": ["skills", "experience"]
  }'::jsonb,
  ai_suggestions JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, user_id)
);

-- Add RLS policies
ALTER TABLE cover_letters ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own cover letters
CREATE POLICY "Users can view their own cover letters"
  ON cover_letters
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own cover letters
CREATE POLICY "Users can insert their own cover letters"
  ON cover_letters
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own cover letters
CREATE POLICY "Users can update their own cover letters"
  ON cover_letters
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own cover letters
CREATE POLICY "Users can delete their own cover letters"
  ON cover_letters
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_cover_letters_job_user 
  ON cover_letters(job_id, user_id);

-- Create index for user lookups
CREATE INDEX idx_cover_letters_user 
  ON cover_letters(user_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cover_letters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cover_letters_updated_at
  BEFORE UPDATE ON cover_letters
  FOR EACH ROW
  EXECUTE FUNCTION update_cover_letters_updated_at();

-- Add comment
COMMENT ON TABLE cover_letters IS 'Stores user-generated cover letters for job applications with AI assistance';
