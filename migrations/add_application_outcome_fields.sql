-- Add fields to track application outcomes and interview progress
-- This enables tracking success rates, interview stages, and final outcomes

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS outcome TEXT CHECK (outcome IN ('pending', 'in_review', 'interview', 'rejected', 'offer', 'accepted', 'withdrawn')),
ADD COLUMN IF NOT EXISTS interview_stage TEXT CHECK (interview_stage IN ('phone_screen', 'technical', 'onsite', 'final_round', 'offer_stage'));

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_jobs_outcome ON jobs(outcome);
CREATE INDEX IF NOT EXISTS idx_jobs_interview_stage ON jobs(interview_stage);

-- Add comments
COMMENT ON COLUMN jobs.outcome IS 'Final outcome of the application: pending, in_review, interview, rejected, offer, accepted, withdrawn';
COMMENT ON COLUMN jobs.interview_stage IS 'Current interview stage if in interview process';

-- Set default outcome for existing submitted jobs
UPDATE jobs
SET outcome = 'pending'
WHERE status = 'Submitted' AND outcome IS NULL;

