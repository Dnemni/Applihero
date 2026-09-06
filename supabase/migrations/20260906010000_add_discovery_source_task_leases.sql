-- A task lease prevents duplicate task claims. A separate source lease prevents
-- two hourly buckets for the same employer from running provider work at once.

CREATE OR REPLACE FUNCTION public.acquire_discovery_source_lease(
  p_source_id UUID,
  p_lease_token UUID,
  p_lease_seconds INTEGER DEFAULT 480
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE updated_count INTEGER;
BEGIN
  UPDATE public.job_sources source
  SET scan_lock_token = p_lease_token,
      scan_locked_until = NOW() + make_interval(secs => GREATEST(60, LEAST(COALESCE(p_lease_seconds, 480), 840)))
  WHERE source.id = p_source_id
    AND source.enabled = TRUE
    AND (source.scan_locked_until IS NULL OR source.scan_locked_until < NOW());
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_discovery_source_lease(
  p_source_id UUID,
  p_lease_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE updated_count INTEGER;
BEGIN
  UPDATE public.job_sources
  SET scan_lock_token = NULL, scan_locked_until = NULL
  WHERE id = p_source_id AND scan_lock_token = p_lease_token;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.defer_discovery_ingestion_task(
  p_task_id UUID,
  p_lease_token UUID,
  p_delay_seconds INTEGER DEFAULT 60,
  p_reason TEXT DEFAULT 'Source scan lease is busy'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE updated_count INTEGER;
BEGIN
  UPDATE public.discovery_ingestion_tasks task
  SET status = 'retry_wait',
      attempts = GREATEST(0, task.attempts - 1),
      available_at = NOW() + make_interval(secs => GREATEST(15, LEAST(COALESCE(p_delay_seconds, 60), 600))),
      lease_token = NULL,
      lease_expires_at = NULL,
      finished_at = NULL,
      last_error = LEFT(COALESCE(p_reason, 'Source scan lease is busy'), 2000),
      result_summary = COALESCE(task.result_summary, '{}'::jsonb) || jsonb_build_object('deferred', TRUE),
      updated_at = NOW()
  WHERE task.id = p_task_id AND task.status = 'running' AND task.lease_token = p_lease_token;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_discovery_source_tasks(p_source_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE reconciled_count INTEGER;
BEGIN
  WITH reconciled AS (
    UPDATE public.discovery_ingestion_tasks task
    SET status = 'succeeded', finished_at = NOW(), lease_token = NULL,
        lease_expires_at = NULL, last_error = NULL,
        result_summary = COALESCE(task.result_summary, '{}'::jsonb) || jsonb_build_object(
          'reconciled', TRUE,
          'reason', 'A successful source scan satisfied this hourly bucket'
        ),
        updated_at = NOW()
    FROM public.job_sources source
    WHERE source.id = p_source_id
      AND task.source_id = source.id
      AND task.status IN ('queued', 'retry_wait', 'failed')
      AND source.last_successful_scan_at IS NOT NULL
      AND source.last_successful_scan_at >= task.scheduled_for
    RETURNING task.id
  )
  SELECT count(*)::INTEGER INTO reconciled_count FROM reconciled;
  RETURN reconciled_count;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_discovery_source_lease(UUID, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_discovery_source_lease(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.defer_discovery_ingestion_task(UUID, UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_discovery_source_tasks(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquire_discovery_source_lease(UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_discovery_source_lease(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.defer_discovery_ingestion_task(UUID, UUID, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_discovery_source_tasks(UUID) TO service_role;

COMMENT ON FUNCTION public.defer_discovery_ingestion_task(UUID, UUID, INTEGER, TEXT) IS
  'Defers a task whose source is already leased without consuming its retry budget.';

NOTIFY pgrst, 'reload schema';
