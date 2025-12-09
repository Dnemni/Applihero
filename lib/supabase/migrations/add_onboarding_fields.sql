-- Migration: Add onboarding fields to profiles table
-- This allows storing onboarding progress in the database instead of localStorage

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS onboarding_phase TEXT DEFAULT 'profile' CHECK (onboarding_phase IN ('profile', 'dashboard', 'job-creation', 'job-detail', 'resume-optimizer', 'completed')),
ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS onboarding_completed_phases TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS onboarding_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.onboarding_phase IS 'Current phase of user onboarding tutorial';
COMMENT ON COLUMN profiles.onboarding_step IS 'Current step within the onboarding phase';
COMMENT ON COLUMN profiles.onboarding_completed_phases IS 'Array of completed onboarding phases';
COMMENT ON COLUMN profiles.onboarding_job_id IS 'Tutorial job ID for tracking during onboarding';
