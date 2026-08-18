CREATE TABLE IF NOT EXISTS application_form_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('career_site', 'browser_extension', 'manual')),
  source_url TEXT NOT NULL,
  provider TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, content_hash)
);

CREATE TABLE IF NOT EXISTS application_form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES application_form_snapshots(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  external_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  section TEXT NOT NULL DEFAULT 'Application',
  help_text TEXT,
  suggested_answer TEXT,
  answer_source TEXT NOT NULL DEFAULT 'none' CHECK (answer_source IN ('profile', 'resume', 'user', 'none')),
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(snapshot_id, external_key)
);

CREATE INDEX IF NOT EXISTS idx_application_form_snapshots_job_observed
  ON application_form_snapshots(job_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_form_fields_job
  ON application_form_fields(job_id, order_index);

ALTER TABLE application_form_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_form_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own application form snapshots" ON application_form_snapshots;
CREATE POLICY "Users can view own application form snapshots" ON application_form_snapshots
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own application form snapshots" ON application_form_snapshots;
CREATE POLICY "Users can insert own application form snapshots" ON application_form_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = job_id AND jobs.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can view own application form fields" ON application_form_fields;
CREATE POLICY "Users can view own application form fields" ON application_form_fields
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = application_form_fields.job_id AND jobs.user_id = auth.uid()
  ));

COMMENT ON TABLE application_form_snapshots IS
  'Provider-neutral application-form observations. Browser extensions write the same normalized format as server-side career-site parsers.';
