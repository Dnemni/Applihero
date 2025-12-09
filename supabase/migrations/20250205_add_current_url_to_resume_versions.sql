-- Add current_url column to resume_versions table
-- This stores the URL of the current version of the resume PDF

ALTER TABLE resume_versions
ADD COLUMN current_url TEXT;

-- Add comment to describe the column
COMMENT ON COLUMN resume_versions.current_url IS 'URL of the current version resume PDF. Initially copied from profile.resume_url, then updated with new version URLs on each save.';

-- Create index for faster lookups by current_url
CREATE INDEX IF NOT EXISTS idx_resume_versions_current_url ON resume_versions(current_url);
