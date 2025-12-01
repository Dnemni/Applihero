-- Add templates column to cover_letters to persist generated templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='cover_letters' AND column_name='templates'
  ) THEN
    ALTER TABLE cover_letters
      ADD COLUMN templates JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;
