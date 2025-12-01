-- Migration: Add onboarding_completed field to profiles table
-- Run this in your Supabase SQL editor

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Update existing users to have onboarding_completed = false
UPDATE profiles 
SET onboarding_completed = false 
WHERE onboarding_completed IS NULL;

-- Add comment to document the field
COMMENT ON COLUMN profiles.onboarding_completed IS 'Tracks whether the user has completed the onboarding tutorial';

