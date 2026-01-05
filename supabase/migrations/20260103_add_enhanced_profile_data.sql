-- Enhanced Profile Data Migration
-- Adds tables for skills, experience, education, and projects

-- Create profile_skills table
CREATE TABLE IF NOT EXISTS public.profile_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  category TEXT, -- 'technical', 'soft', 'language', 'tool', 'framework', 'domain_knowledge', 'other'
  proficiency_level TEXT, -- 'beginner', 'intermediate', 'advanced', 'expert'
  years_of_experience INTEGER,
  source TEXT NOT NULL, -- 'resume', 'transcript', 'linkedin', 'manual'
  source_confidence DECIMAL(3,2), -- 0.00 to 1.00 for AI-parsed data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_skill UNIQUE(user_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_profile_skills_user_id ON public.profile_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_skills_category ON public.profile_skills(category);

-- Create profile_experience table
CREATE TABLE IF NOT EXISTS public.profile_experience (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  start_date DATE,
  end_date DATE, -- NULL if current position
  is_current BOOLEAN DEFAULT false,
  location TEXT,
  description TEXT,
  achievements TEXT[], -- Array of achievement bullets
  technologies_used TEXT[], -- Array of technologies/tools used
  source TEXT NOT NULL, -- 'resume', 'transcript', 'linkedin', 'manual'
  source_confidence DECIMAL(3,2),
  linkedin_company_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_experience_user_id ON public.profile_experience(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_experience_dates ON public.profile_experience(start_date DESC, end_date DESC);
CREATE INDEX IF NOT EXISTS idx_profile_experience_current ON public.profile_experience(user_id, is_current) WHERE is_current = true;

-- Create profile_education table
CREATE TABLE IF NOT EXISTS public.profile_education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  institution_name TEXT NOT NULL,
  degree TEXT, -- 'Bachelor of Science', 'Master of Arts', 'PhD', etc.
  field_of_study TEXT,
  start_date DATE,
  end_date DATE, -- NULL if currently enrolled
  is_current BOOLEAN DEFAULT false,
  gpa DECIMAL(3,2),
  gpa_scale DECIMAL(3,2) DEFAULT 4.00,
  honors TEXT[], -- Array of honors, awards, dean's list, etc.
  relevant_coursework TEXT[], -- Array of relevant courses
  description TEXT,
  source TEXT NOT NULL, -- 'resume', 'transcript', 'linkedin', 'manual'
  source_confidence DECIMAL(3,2),
  linkedin_school_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_education_user_id ON public.profile_education(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_education_dates ON public.profile_education(start_date DESC, end_date DESC);

-- Create profile_projects table
CREATE TABLE IF NOT EXISTS public.profile_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  description TEXT,
  role TEXT, -- 'Lead Developer', 'Team Member', 'Solo Project', etc.
  start_date DATE,
  end_date DATE, -- NULL if ongoing
  is_ongoing BOOLEAN DEFAULT false,
  technologies_used TEXT[], -- Array of technologies/frameworks used
  achievements TEXT[], -- Array of key accomplishments or features
  project_url TEXT, -- GitHub, portfolio, demo link, etc.
  source TEXT NOT NULL, -- 'resume', 'transcript', 'manual'
  source_confidence DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_projects_user_id ON public.profile_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_projects_dates ON public.profile_projects(start_date DESC, end_date DESC);

-- Add metadata columns to profiles table
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS profile_data_parsed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_data_sources TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS profile_completeness_score INTEGER DEFAULT 0;

-- Add comments for documentation
COMMENT ON TABLE public.profile_skills IS 'Stores user skills extracted from resume, transcript, LinkedIn, or manually entered';
COMMENT ON TABLE public.profile_experience IS 'Stores user work experience history';
COMMENT ON TABLE public.profile_education IS 'Stores user educational background';
COMMENT ON TABLE public.profile_projects IS 'Stores user projects (personal, academic, or professional)';

COMMENT ON COLUMN public.profile_skills.source_confidence IS 'Confidence score (0.00-1.00) for AI-parsed data';
COMMENT ON COLUMN public.profile_experience.source_confidence IS 'Confidence score (0.00-1.00) for AI-parsed data';
COMMENT ON COLUMN public.profile_education.source_confidence IS 'Confidence score (0.00-1.00) for AI-parsed data';
COMMENT ON COLUMN public.profile_projects.source_confidence IS 'Confidence score (0.00-1.00) for AI-parsed data';

COMMENT ON COLUMN public.profiles.profile_data_parsed_at IS 'Timestamp of last profile data parsing';
COMMENT ON COLUMN public.profiles.profile_data_sources IS 'Array of sources that have been parsed (resume, transcript, linkedin)';
COMMENT ON COLUMN public.profiles.profile_completeness_score IS 'Profile completeness score (0-100)';
