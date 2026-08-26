-- Provider-aware discovery ingestion state.
-- This extends the existing shared job_sources/discovery_jobs model rather
-- than introducing a second company or jobs catalog.
-- Providers are stored as text in the current schema, so Workable and
-- Eightfold do not require a separate enum migration.

ALTER TABLE public.job_sources
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'verified'
    CHECK (verification_status IN ('unverified', 'verified', 'unsupported', 'failed')),
  ADD COLUMN IF NOT EXISTS verification_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  ADD COLUMN IF NOT EXISTS scan_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_successful_scan_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_full_scan_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_scan_mode TEXT
    CHECK (last_scan_mode IS NULL OR last_scan_mode IN ('bootstrap', 'incremental', 'reconcile')),
  ADD COLUMN IF NOT EXISTS last_scan_strategy TEXT,
  ADD COLUMN IF NOT EXISTS last_board_total INTEGER,
  ADD COLUMN IF NOT EXISTS scan_lock_token UUID,
  ADD COLUMN IF NOT EXISTS scan_locked_until TIMESTAMPTZ;

ALTER TABLE public.discovery_jobs
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_published_precision TEXT NOT NULL DEFAULT 'unknown'
    CHECK (source_published_precision IN ('instant', 'day', 'relative_day', 'unknown')),
  ADD COLUMN IF NOT EXISTS source_published_source TEXT,
  ADD COLUMN IF NOT EXISTS listing_hash TEXT,
  ADD COLUMN IF NOT EXISTS bootstrap_observed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (enrichment_status IN ('pending', 'processing', 'complete', 'failed')),
  ADD COLUMN IF NOT EXISTS enrichment_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enrichment_last_error TEXT,
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS missing_reconciliations INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

UPDATE public.discovery_jobs
SET
  first_seen_at = COALESCE(first_seen_at, discovered_at, created_at, NOW()),
  last_seen_at = COALESCE(last_seen_at, last_verified_at, updated_at, NOW()),
  bootstrap_observed = TRUE,
  enrichment_status = CASE WHEN COALESCE(description, '') <> '' THEN 'complete' ELSE 'pending' END,
  enriched_at = CASE WHEN COALESCE(description, '') <> '' THEN COALESCE(enriched_at, updated_at, NOW()) ELSE enriched_at END
WHERE first_seen_at IS NULL OR last_seen_at IS NULL;

ALTER TABLE public.discovery_jobs
  ALTER COLUMN first_seen_at SET DEFAULT NOW(),
  ALTER COLUMN first_seen_at SET NOT NULL,
  ALTER COLUMN last_seen_at SET DEFAULT NOW(),
  ALTER COLUMN last_seen_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discovery_jobs_first_seen
  ON public.discovery_jobs(status, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_enrichment
  ON public.discovery_jobs(enrichment_status, first_seen_at)
  WHERE status <> 'closed';
CREATE INDEX IF NOT EXISTS idx_job_sources_scan_lock
  ON public.job_sources(scan_locked_until)
  WHERE enabled = TRUE;

CREATE TABLE IF NOT EXISTS public.discovery_scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.job_sources(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  mode TEXT NOT NULL CHECK (mode IN ('bootstrap', 'incremental', 'reconcile')),
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed', 'skipped_locked')),
  strategy TEXT,
  board_total INTEGER,
  enumerated_count INTEGER NOT NULL DEFAULT 0,
  pages_fetched INTEGER NOT NULL DEFAULT 0,
  new_job_count INTEGER NOT NULL DEFAULT 0,
  changed_job_count INTEGER NOT NULL DEFAULT 0,
  queued_enrichment_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_scan_runs_source
  ON public.discovery_scan_runs(source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_scan_runs_failures
  ON public.discovery_scan_runs(status, started_at DESC)
  WHERE status = 'failed';

CREATE TABLE IF NOT EXISTS public.discovery_enrichment_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discovery_job_id UUID NOT NULL REFERENCES public.discovery_jobs(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.job_sources(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  priority INTEGER NOT NULL DEFAULT 100,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  lock_token UUID,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(discovery_job_id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_enrichment_due
  ON public.discovery_enrichment_queue(status, next_attempt_at, priority, created_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.discovery_scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_enrichment_queue ENABLE ROW LEVEL SECURITY;

-- These operational tables intentionally have no client policies. The service
-- role used by the scanner bypasses RLS; authenticated application users do not.

CREATE OR REPLACE FUNCTION public.claim_discovery_enrichment(
  p_limit INTEGER,
  p_lock_token UUID
)
RETURNS SETOF public.discovery_enrichment_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT q.id
    FROM public.discovery_enrichment_queue q
    WHERE q.status IN ('pending', 'failed')
      AND q.next_attempt_at <= NOW()
      AND (q.locked_at IS NULL OR q.locked_at < NOW() - INTERVAL '10 minutes')
    ORDER BY q.priority ASC, q.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 100))
  )
  UPDATE public.discovery_enrichment_queue q
  SET status = 'processing', locked_at = NOW(), lock_token = p_lock_token, updated_at = NOW()
  FROM due
  WHERE q.id = due.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_discovery_enrichment(INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_discovery_enrichment(INTEGER, UUID) TO service_role;

COMMENT ON COLUMN public.discovery_jobs.first_seen_at IS
  'Exact time AppliHero first observed this provider job ID; never derived from the provider posting date.';
COMMENT ON COLUMN public.discovery_jobs.source_published_at IS
  'Employer/ATS publication time when supplied. Precision and provenance are stored separately.';
COMMENT ON COLUMN public.discovery_jobs.bootstrap_observed IS
  'True for jobs first observed while establishing a source baseline; these must not generate new-job alerts.';
COMMENT ON TABLE public.discovery_scan_runs IS
  'Operational telemetry for provider scans, including cold/warm strategy and coverage metadata.';
COMMENT ON TABLE public.discovery_enrichment_queue IS
  'Retryable detail hydration queue separated from metadata discovery.';

-- Seed the newly validated adapters into the chooser. Upsert by the existing
-- provider/external-key identity so the migration is safe to rerun.
INSERT INTO public.job_sources (provider, external_key, company_name, career_url, config, enabled)
VALUES
  ('eightfold', 'microsoft.com', 'Microsoft', 'https://apply.careers.microsoft.com/careers',
    '{"apiUrl":"https://apply.careers.microsoft.com/api/pcsx/search","domain":"microsoft.com","origin":"https://apply.careers.microsoft.com","maxJobs":100}'::jsonb, TRUE),
  ('workday', 'nvidia/NVIDIAExternalCareerSite', 'NVIDIA', 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite',
    '{"host":"nvidia.wd5.myworkdayjobs.com","tenant":"nvidia","site":"NVIDIAExternalCareerSite","maxJobs":100}'::jsonb, TRUE),
  ('ashby', 'openai', 'OpenAI', 'https://jobs.ashbyhq.com/openai',
    '{"board":"openai"}'::jsonb, TRUE),
  ('workable', 'netguru', 'Netguru', 'https://apply.workable.com/netguru',
    '{"account":"netguru"}'::jsonb, TRUE)
ON CONFLICT (provider, external_key) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  career_url = EXCLUDED.career_url,
  config = EXCLUDED.config,
  enabled = TRUE;

NOTIFY pgrst, 'reload schema';
