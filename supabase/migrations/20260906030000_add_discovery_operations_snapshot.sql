-- Exact, compact queue health for the protected operations endpoint. Keeping
-- aggregation in Postgres avoids PostgREST row caps and large status payloads.

CREATE OR REPLACE FUNCTION public.get_discovery_operations_snapshot()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'supersededTaskCount', (
      SELECT count(*)
      FROM public.discovery_ingestion_tasks task
      JOIN public.job_sources source ON source.id = task.source_id
      WHERE task.status IN ('queued', 'retry_wait', 'failed')
        AND source.last_successful_scan_at IS NOT NULL
        AND source.last_successful_scan_at >= task.scheduled_for
    ),
    'enrichmentCounts', (
      SELECT COALESCE(jsonb_object_agg(status, count), '{}'::jsonb)
      FROM (
        SELECT status, count(*) AS count
        FROM public.discovery_enrichment_queue
        GROUP BY status
      ) counts
    ),
    'enrichmentOldestDueAt', (
      SELECT min(next_attempt_at)
      FROM public.discovery_enrichment_queue
      WHERE status IN ('pending', 'retry_wait', 'failed') AND attempts < max_attempts
    ),
    'enrichmentDeadByKind', (
      SELECT COALESCE(jsonb_object_agg(kind, count), '{}'::jsonb)
      FROM (
        SELECT COALESCE(failure_kind, 'unknown') AS kind, count(*) AS count
        FROM public.discovery_enrichment_queue
        WHERE status = 'dead'
        GROUP BY COALESCE(failure_kind, 'unknown')
      ) counts
    ),
    'enrichmentDeadByProvider', (
      SELECT COALESCE(jsonb_object_agg(provider, count), '{}'::jsonb)
      FROM (
        SELECT source.provider, count(*) AS count
        FROM public.discovery_enrichment_queue queue
        JOIN public.job_sources source ON source.id = queue.source_id
        WHERE queue.status = 'dead'
        GROUP BY source.provider
      ) counts
    ),
    'rematch', (
      SELECT jsonb_build_object(
        'subscribedUsers', count(*),
        'neverRematchedUsers', count(*) FILTER (WHERE profile.discovery_rematched_at IS NULL),
        'oldestRematchedAt', min(profile.discovery_rematched_at),
        'newestRematchedAt', max(profile.discovery_rematched_at)
      )
      FROM (
        SELECT DISTINCT user_id
        FROM public.user_job_source_subscriptions
        WHERE enabled = TRUE
      ) subscription
      JOIN public.profiles profile ON profile.id = subscription.user_id
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_discovery_operations_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_discovery_operations_snapshot() TO service_role;

COMMENT ON FUNCTION public.get_discovery_operations_snapshot() IS
  'Returns exact compact ingestion, enrichment, and rematch health without API row-limit truncation.';

NOTIFY pgrst, 'reload schema';
