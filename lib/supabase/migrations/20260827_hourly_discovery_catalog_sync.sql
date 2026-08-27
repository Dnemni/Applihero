-- The catalog is synchronized once per hour by the sharded GitHub Action.
-- Existing sources created under the original 15-minute cadence are normalized
-- so per-source status and user-facing freshness wording match that schedule.
ALTER TABLE job_sources
  ALTER COLUMN sync_interval_minutes SET DEFAULT 60;

UPDATE job_sources
SET sync_interval_minutes = 60
WHERE sync_interval_minutes < 60;

NOTIFY pgrst, 'reload schema';
