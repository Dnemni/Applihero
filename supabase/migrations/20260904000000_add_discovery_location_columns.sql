-- Normalized geography for the shared discovery catalog.
--
-- The Discover page applies a strict saved-location rule (country, preferred
-- regions, remote). Evaluating that rule in application memory after a LIMIT
-- produced pages with 7 of 50 rows and made totals meaningless. These columns
-- let Postgres apply the rule before paging. They are written by the ingestion
-- and enrichment workers from `lib/discovery/location.ts` and backfilled by
-- `scripts/backfill-discovery-locations.ts`; the classifier version lets that
-- script find rows to reclassify when the rules change.

ALTER TABLE public.discovery_jobs
  ADD COLUMN IF NOT EXISTS location_countries TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS location_remote BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS location_classifier_version TEXT;

-- Containment lookups for `location_countries @> '{US}'` on open rows.
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_location_countries
  ON public.discovery_jobs USING GIN (location_countries)
  WHERE status = 'open';

-- Remote-only and non-remote paging in publication order.
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_open_remote_published
  ON public.discovery_jobs (location_remote, source_published_at DESC NULLS LAST, id)
  WHERE status = 'open';

-- Stable keyset/offset paging for the catalog: newest provider date first,
-- unknown dates last, then id as the tiebreaker.
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_open_published_id
  ON public.discovery_jobs (source_published_at DESC NULLS LAST, id)
  WHERE status = 'open';

-- The Matches query joins recommendations to open jobs ordered by the job's
-- publication date; this covers the recommendation side of that join.
CREATE INDEX IF NOT EXISTS idx_user_job_recommendations_matches
  ON public.user_job_recommendations (user_id, fit_score DESC, discovery_job_id)
  WHERE active = TRUE AND fit_band <> 'likely_conflict' AND eligibility_status <> 'conflict';

COMMENT ON COLUMN public.discovery_jobs.location_countries IS
  'Country codes recognized in the provider location string (all listed places). Empty when unrecognized.';
COMMENT ON COLUMN public.discovery_jobs.location_remote IS
  'True when the posting is remote by workplace type or an explicit remote marker in its location.';
COMMENT ON COLUMN public.discovery_jobs.location_classifier_version IS
  'Version of lib/discovery/location.ts that produced the normalized geography.';

NOTIFY pgrst, 'reload schema';
