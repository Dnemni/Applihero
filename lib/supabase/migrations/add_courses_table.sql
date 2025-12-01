-- Migration: Add courses table for transcript course data
-- Run this in your Supabase SQL editor

-- Courses Table
-- Stores individual courses from transcripts
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  education_id UUID REFERENCES education(id) ON DELETE CASCADE,
  course_code TEXT, -- e.g., 'CS101', 'MATH201'
  course_name TEXT NOT NULL,
  grade TEXT, -- Letter grade (A, B, C, etc.) or percentage
  credits NUMERIC(4, 2), -- Credits for the course (e.g., 3.0, 4.0)
  term TEXT, -- Fall, Spring, Summer, Winter
  year TEXT, -- YYYY format
  gpa_points NUMERIC(3, 2), -- GPA points for this course (e.g., 4.0, 3.7)
  course_description TEXT, -- Description of the course content
  learning_materials TEXT, -- Common learning materials/resources found online
  prerequisites TEXT[], -- Array of prerequisite course codes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_courses_user_id ON courses(user_id);
CREATE INDEX IF NOT EXISTS idx_courses_education_id ON courses(education_id);
CREATE INDEX IF NOT EXISTS idx_courses_course_code ON courses(course_code);
CREATE INDEX IF NOT EXISTS idx_courses_term_year ON courses(user_id, year, term);

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- Courses policies
CREATE POLICY "Users can view own courses"
  ON courses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own courses"
  ON courses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own courses"
  ON courses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own courses"
  ON courses FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE courses IS 'Stores individual courses from academic transcripts';
COMMENT ON COLUMN courses.course_code IS 'Course identifier code (e.g., CS101)';
COMMENT ON COLUMN courses.grade IS 'Letter grade or percentage received';
COMMENT ON COLUMN courses.credits IS 'Number of credit hours for the course';
COMMENT ON COLUMN courses.gpa_points IS 'GPA points earned for this course (typically 0.0-4.0)';
COMMENT ON COLUMN courses.course_description IS 'Description of course content and topics covered';
COMMENT ON COLUMN courses.learning_materials IS 'Common textbooks, resources, or learning materials found online for this course';
COMMENT ON COLUMN courses.prerequisites IS 'Array of course codes that are prerequisites for this course';

