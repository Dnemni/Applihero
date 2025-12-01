-- Add feedback columns to questions table
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS feedback_score INTEGER CHECK (feedback_score >= 1 AND feedback_score <= 10),
ADD COLUMN IF NOT EXISTS feedback_notes TEXT;

-- Add comments for documentation
COMMENT ON COLUMN questions.feedback_score IS 'AI-generated score from 1-10 for the answer quality';
COMMENT ON COLUMN questions.feedback_notes IS 'AI-generated bullet point feedback for improving the answer';
