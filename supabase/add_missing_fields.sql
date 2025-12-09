-- Add missing fields to existing resume_versions table

ALTER TABLE resume_versions
ADD COLUMN IF NOT EXISTS current_url TEXT,
ADD COLUMN IF NOT EXISTS feedback_score INTEGER,
ADD COLUMN IF NOT EXISTS feedback_text JSONB;

-- Add index for current_url
CREATE INDEX IF NOT EXISTS idx_resume_versions_current_url ON resume_versions(current_url);

-- Add comment
COMMENT ON COLUMN resume_versions.current_url IS 'URL of the current version resume PDF. Initially copied from profile.resume_url, then updated with new version URLs on each save.';
