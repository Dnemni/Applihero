-- Migration: Add tables for parsed resume data
-- Run this in your Supabase SQL editor

-- Skills Table
-- Stores skills extracted from resume
CREATE TABLE IF NOT EXISTS profile_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  category TEXT, -- e.g., 'technical', 'soft', 'language', 'certification'
  proficiency_level TEXT, -- e.g., 'beginner', 'intermediate', 'advanced', 'expert'
  years_of_experience INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, skill_name)
);

-- Work Experience Table
-- Stores work experience extracted from resume
CREATE TABLE IF NOT EXISTS work_experience (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN DEFAULT false,
  location TEXT,
  description TEXT, -- Full job description
  achievements TEXT[], -- Array of achievements/bullet points
  skills_used TEXT[], -- Skills mentioned for this role
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Education Table
-- Stores education history extracted from resume
CREATE TABLE IF NOT EXISTS education (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  institution_name TEXT NOT NULL,
  degree TEXT, -- e.g., 'Bachelor of Science', 'Master of Arts'
  field_of_study TEXT, -- e.g., 'Computer Science', 'Business Administration'
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN DEFAULT false,
  gpa TEXT, -- Store as text to handle different formats
  honors TEXT[], -- Array of honors/awards
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hobbies and Interests Table
-- Stores hobbies/interests extracted from resume
CREATE TABLE IF NOT EXISTS hobbies_interests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT, -- e.g., 'sports', 'arts', 'volunteering', 'other'
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Resume Parsing Status Table
-- Tracks resume parsing status and metadata
CREATE TABLE IF NOT EXISTS resume_parsing_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  parsed_at TIMESTAMPTZ,
  error_message TEXT,
  raw_text TEXT, -- Store extracted raw text from PDF
  parsing_metadata JSONB, -- Store additional metadata about the parsing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_profile_skills_user_id ON profile_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_skills_category ON profile_skills(category);
CREATE INDEX IF NOT EXISTS idx_work_experience_user_id ON work_experience(user_id);
CREATE INDEX IF NOT EXISTS idx_work_experience_dates ON work_experience(user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_education_user_id ON education(user_id);
CREATE INDEX IF NOT EXISTS idx_education_dates ON education(user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_hobbies_user_id ON hobbies_interests(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_parsing_status_user_id ON resume_parsing_status(user_id);

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE profile_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_experience ENABLE ROW LEVEL SECURITY;
ALTER TABLE education ENABLE ROW LEVEL SECURITY;
ALTER TABLE hobbies_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_parsing_status ENABLE ROW LEVEL SECURITY;

-- Profile Skills policies
CREATE POLICY "Users can view own skills"
  ON profile_skills FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own skills"
  ON profile_skills FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own skills"
  ON profile_skills FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own skills"
  ON profile_skills FOR DELETE
  USING (auth.uid() = user_id);

-- Work Experience policies
CREATE POLICY "Users can view own work experience"
  ON work_experience FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own work experience"
  ON work_experience FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own work experience"
  ON work_experience FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own work experience"
  ON work_experience FOR DELETE
  USING (auth.uid() = user_id);

-- Education policies
CREATE POLICY "Users can view own education"
  ON education FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own education"
  ON education FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own education"
  ON education FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own education"
  ON education FOR DELETE
  USING (auth.uid() = user_id);

-- Hobbies/Interests policies
CREATE POLICY "Users can view own hobbies"
  ON hobbies_interests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own hobbies"
  ON hobbies_interests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own hobbies"
  ON hobbies_interests FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own hobbies"
  ON hobbies_interests FOR DELETE
  USING (auth.uid() = user_id);

-- Resume Parsing Status policies
CREATE POLICY "Users can view own parsing status"
  ON resume_parsing_status FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own parsing status"
  ON resume_parsing_status FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own parsing status"
  ON resume_parsing_status FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_profile_skills_updated_at
  BEFORE UPDATE ON profile_skills
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_work_experience_updated_at
  BEFORE UPDATE ON work_experience
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_education_updated_at
  BEFORE UPDATE ON education
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hobbies_interests_updated_at
  BEFORE UPDATE ON hobbies_interests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resume_parsing_status_updated_at
  BEFORE UPDATE ON resume_parsing_status
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

