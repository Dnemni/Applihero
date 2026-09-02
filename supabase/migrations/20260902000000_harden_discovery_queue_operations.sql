-- Operational hardening for the durable discovery queue. A task from an
-- earlier hourly bucket is no longer actionable once its source has completed
-- a later successful scan, so preserve the audit row but mark it reconciled.

CREATE OR REPLACE FUNCTION public.reconcile_discovery_ingestion_tasks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE reconciled_count INTEGER;
BEGIN
  WITH reconciled AS (
    UPDATE public.discovery_ingestion_tasks task
    SET status = 'succeeded',
        finished_at = NOW(),
        lease_token = NULL,
        lease_expires_at = NULL,
        last_error = NULL,
        result_summary = COALESCE(task.result_summary, '{}'::jsonb) || jsonb_build_object(
          'reconciled', TRUE,
          'reason', 'A newer successful source scan superseded this task'
        ),
        updated_at = NOW()
    FROM public.job_sources source
    WHERE source.id = task.source_id
      AND task.status IN ('queued', 'retry_wait', 'failed')
      AND source.last_successful_scan_at IS NOT NULL
      AND source.last_successful_scan_at >= task.scheduled_for
    RETURNING task.id
  )
  SELECT count(*)::INTEGER INTO reconciled_count FROM reconciled;
  RETURN reconciled_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_discovery_ingestion_tasks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_discovery_ingestion_tasks() TO service_role;

COMMENT ON FUNCTION public.reconcile_discovery_ingestion_tasks() IS
  'Completes obsolete task records after a later successful scan proves their source is current.';

NOTIFY pgrst, 'reload schema';
