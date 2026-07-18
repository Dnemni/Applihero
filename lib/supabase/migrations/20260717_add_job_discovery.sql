-- Job discovery is intentionally separate from `jobs`.
-- `discovery_jobs` is the shared catalog; `jobs` remains a user's application workspace.

CREATE TABLE IF NOT EXISTS job_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL,
  external_key TEXT NOT NULL,
  company_name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_sync_started_at TIMESTAMPTZ,
  last_sync_completed_at TIMESTAMPTZ,
  last_sync_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, external_key)
);

CREATE TABLE IF NOT EXISTS discovery_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES job_sources(id) ON DELETE CASCADE,
  source_job_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  description_html TEXT,
  location TEXT,
  workplace_type TEXT,
  employment_type TEXT,
  departments TEXT[] NOT NULL DEFAULT '{}',
  source_url TEXT NOT NULL,
  apply_url TEXT NOT NULL,
  source_published_at TIMESTAMPTZ,
  source_updated_at TIMESTAMPTZ,
  application_deadline TIMESTAMPTZ,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'unverified', 'closed')),
  consecutive_misses INTEGER NOT NULL DEFAULT 0,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  parsed_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  parser_version TEXT NOT NULL DEFAULT 'requirements-v1',
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_id, source_job_id)
);

CREATE TABLE IF NOT EXISTS job_match_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  discovery_job_id UUID NOT NULL REFERENCES discovery_jobs(id) ON DELETE CASCADE,
  profile_hash TEXT NOT NULL,
  job_hash TEXT NOT NULL,
  matcher_version TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, discovery_job_id, profile_hash, job_hash, matcher_version)
);

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS discovery_job_id UUID REFERENCES discovery_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_sources_enabled
  ON job_sources(provider, enabled);
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_fresh
  ON discovery_jobs(status, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_published
  ON discovery_jobs(status, source_published_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_source
  ON discovery_jobs(source_id);
CREATE INDEX IF NOT EXISTS idx_job_match_runs_lookup
  ON job_match_runs(user_id, discovery_job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_discovery_job_id
  ON jobs(discovery_job_id);

ALTER TABLE job_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_match_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view job sources" ON job_sources;
CREATE POLICY "Authenticated users can view job sources"
  ON job_sources FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can view discovery jobs" ON discovery_jobs;
CREATE POLICY "Authenticated users can view discovery jobs"
  ON discovery_jobs FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can view own job match runs" ON job_match_runs;
CREATE POLICY "Users can view own job match runs"
  ON job_match_runs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own job match runs" ON job_match_runs;
CREATE POLICY "Users can insert own job match runs"
  ON job_match_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_discovery_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_job_sources_updated_at ON job_sources;
CREATE TRIGGER update_job_sources_updated_at
  BEFORE UPDATE ON job_sources
  FOR EACH ROW EXECUTE FUNCTION update_discovery_updated_at();

DROP TRIGGER IF EXISTS update_discovery_jobs_updated_at ON discovery_jobs;
CREATE TRIGGER update_discovery_jobs_updated_at
  BEFORE UPDATE ON discovery_jobs
  FOR EACH ROW EXECUTE FUNCTION update_discovery_updated_at();

COMMENT ON TABLE discovery_jobs IS
  'Provider-neutral catalog of verified job postings. User application state belongs in jobs.';
COMMENT ON COLUMN discovery_jobs.discovered_at IS
  'First time AppliHero observed the posting; never overwrite during later syncs.';
COMMENT ON COLUMN discovery_jobs.source_published_at IS
  'Employer or ATS supplied publish time. NULL when the source does not provide one.';
COMMENT ON COLUMN discovery_jobs.parsed_requirements IS
  'Versioned parser artifact with source quotes. May be normalized into child tables later.';
