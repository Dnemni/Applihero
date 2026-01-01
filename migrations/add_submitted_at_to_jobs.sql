-- Add submitted_at column to jobs table
-- This tracks when a job application was actually submitted (status changed to 'Submitted')

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- Add index for faster queries on submitted_at
CREATE INDEX IF NOT EXISTS idx_jobs_submitted_at ON jobs(submitted_at);

-- Add comment to describe the column
COMMENT ON COLUMN jobs.submitted_at IS 'Timestamp when the job application status was changed to Submitted. NULL if not yet submitted.';

-- Optional: Backfill existing submitted jobs with their updated_at timestamp
-- This assumes that if a job is currently Submitted, the updated_at is when it was submitted
UPDATE jobs
SET submitted_at = updated_at
WHERE status = 'Submitted' AND submitted_at IS NULL;

