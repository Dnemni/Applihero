-- Keep the searchable discovery catalog compact while moving large provider
-- bodies to private object storage. This is additive: existing Supabase text
-- remains authoritative until the verified backfill is explicitly run.

ALTER TABLE public.discovery_jobs
  ADD COLUMN IF NOT EXISTS content_storage TEXT NOT NULL DEFAULT 'supabase'
    CHECK (content_storage IN ('supabase', 'r2')),
  ADD COLUMN IF NOT EXISTS content_ref TEXT,
  ADD COLUMN IF NOT EXISTS content_stored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS content_bytes INTEGER;

CREATE INDEX IF NOT EXISTS idx_discovery_jobs_r2_content_backfill
  ON public.discovery_jobs (content_storage, updated_at ASC)
  WHERE content_storage = 'supabase';

COMMENT ON COLUMN public.discovery_jobs.content_storage IS
  'Canonical large-content location. Supabase rows remain readable during the staged R2 migration.';
COMMENT ON COLUMN public.discovery_jobs.content_ref IS
  'Private R2 object key for the version identified by content_hash; never exposed directly to browsers.';
COMMENT ON COLUMN public.discovery_jobs.content_bytes IS
  'Serialized UTF-8 byte size of the private content object, for capacity accounting.';

NOTIFY pgrst, 'reload schema';
