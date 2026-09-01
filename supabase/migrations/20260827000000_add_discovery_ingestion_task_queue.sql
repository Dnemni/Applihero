-- Durable source-level orchestration for the hourly discovery catalog scan.
-- Provider parsing and the normalized catalog remain unchanged; this table is
-- only the retryable work ledger which drives those existing scans.

CREATE TABLE IF NOT EXISTS public.discovery_ingestion_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.job_sources(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'retry_wait', 'succeeded', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  priority INTEGER NOT NULL DEFAULT 100,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_error TEXT,
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_id, scheduled_for),
  CHECK (scheduled_for = date_trunc('hour', scheduled_for)),
  CHECK (
    (status = 'running' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR status <> 'running'
  )
);

CREATE INDEX IF NOT EXISTS idx_discovery_ingestion_tasks_ready
  ON public.discovery_ingestion_tasks(status, available_at, priority, created_at)
  WHERE status IN ('queued', 'retry_wait');
CREATE INDEX IF NOT EXISTS idx_discovery_ingestion_tasks_expired_lease
  ON public.discovery_ingestion_tasks(lease_expires_at)
  WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_discovery_ingestion_tasks_source
  ON public.discovery_ingestion_tasks(source_id, scheduled_for DESC);

ALTER TABLE public.discovery_ingestion_tasks ENABLE ROW LEVEL SECURITY;

-- Digest sending is maintained separately from source scans. The lease makes
-- overlapping finalizer invocations select a user at most once; Resend's
-- stable idempotency key is a second boundary around the external send.
ALTER TABLE public.user_discovery_preferences
  ADD COLUMN IF NOT EXISTS digest_lock_token UUID,
  ADD COLUMN IF NOT EXISTS digest_locked_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_discovery_preferences_digest_lease
  ON public.user_discovery_preferences(digest_locked_until)
  WHERE email_enabled = TRUE;

-- Add every enabled company to one deterministic UTC hourly bucket. Calling
-- this repeatedly is safe: the unique task identity absorbs duplicate cron
-- deliveries and the first CTE makes abandoned serverless leases retryable.
CREATE OR REPLACE FUNCTION public.enqueue_discovery_ingestion_hour(
  p_scheduled_for TIMESTAMPTZ DEFAULT date_trunc('hour', NOW())
)
RETURNS TABLE(created_count INTEGER, recovered_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bucket TIMESTAMPTZ := date_trunc('hour', p_scheduled_for);
BEGIN
  WITH recovered AS (
    UPDATE public.discovery_ingestion_tasks
    SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'retry_wait' END,
        available_at = CASE WHEN attempts >= max_attempts THEN available_at ELSE NOW() END,
        lease_token = NULL,
        lease_expires_at = NULL,
        last_error = COALESCE(last_error, 'Worker lease expired before task completion'),
        updated_at = NOW()
    WHERE status = 'running' AND lease_expires_at < NOW()
    RETURNING id
  ), inserted AS (
    INSERT INTO public.discovery_ingestion_tasks (source_id, scheduled_for, status, available_at)
    SELECT id, bucket, 'queued', NOW()
    FROM public.job_sources
    WHERE enabled = TRUE
    ON CONFLICT (source_id, scheduled_for) DO NOTHING
    RETURNING id
  )
  SELECT (SELECT count(*)::INTEGER FROM inserted), (SELECT count(*)::INTEGER FROM recovered)
  INTO created_count, recovered_count;
  RETURN NEXT;
END;
$$;

-- SKIP LOCKED makes concurrent HTTP workers mutually exclusive without a
-- coordinator. Expired leases are claimed by a later worker, so a Vercel
-- timeout cannot lose work.
CREATE OR REPLACE FUNCTION public.claim_discovery_ingestion_tasks(
  p_limit INTEGER,
  p_lease_token UUID,
  p_lease_seconds INTEGER DEFAULT 240
)
RETURNS SETOF public.discovery_ingestion_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT t.id
    FROM public.discovery_ingestion_tasks t
    WHERE (
      (t.status IN ('queued', 'retry_wait') AND t.available_at <= NOW() AND t.attempts < t.max_attempts)
      OR (t.status = 'running' AND t.lease_expires_at < NOW() AND t.attempts < t.max_attempts)
    )
    ORDER BY t.priority ASC, t.available_at ASC, t.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 2), 10))
  )
  UPDATE public.discovery_ingestion_tasks t
  SET status = 'running',
      attempts = t.attempts + 1,
      lease_token = p_lease_token,
      lease_expires_at = NOW() + make_interval(secs => GREATEST(30, LEAST(COALESCE(p_lease_seconds, 240), 840))),
      started_at = COALESCE(t.started_at, NOW()),
      finished_at = NULL,
      updated_at = NOW()
  FROM candidates
  WHERE t.id = candidates.id
  RETURNING t.*;
END;
$$;

-- A stale worker cannot overwrite a newer worker: finishing is guarded by the
-- lease token it received while claiming the task.
CREATE OR REPLACE FUNCTION public.finish_discovery_ingestion_task(
  p_task_id UUID,
  p_lease_token UUID,
  p_succeeded BOOLEAN,
  p_result_summary JSONB DEFAULT '{}'::jsonb,
  p_error TEXT DEFAULT NULL,
  p_retry_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE updated_count INTEGER;
BEGIN
  UPDATE public.discovery_ingestion_tasks t
  SET status = CASE
        WHEN p_succeeded THEN 'succeeded'
        WHEN t.attempts >= t.max_attempts THEN 'failed'
        ELSE 'retry_wait'
      END,
      available_at = CASE WHEN p_succeeded OR t.attempts >= t.max_attempts THEN t.available_at
        ELSE NOW() + make_interval(secs => GREATEST(30, LEAST(COALESCE(p_retry_seconds, 300), 86400))) END,
      lease_token = NULL,
      lease_expires_at = NULL,
      finished_at = NOW(),
      last_error = CASE WHEN p_succeeded THEN NULL ELSE LEFT(COALESCE(p_error, 'Discovery scan failed'), 2000) END,
      result_summary = COALESCE(p_result_summary, '{}'::jsonb),
      updated_at = NOW()
  WHERE t.id = p_task_id AND t.status = 'running' AND t.lease_token = p_lease_token;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_discovery_ingestion_task(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE updated_count INTEGER;
BEGIN
  UPDATE public.discovery_ingestion_tasks
  SET status = 'queued', attempts = 0, available_at = NOW(), lease_token = NULL,
      lease_expires_at = NULL, finished_at = NULL, last_error = NULL, updated_at = NOW()
  WHERE id = p_task_id AND status IN ('failed', 'retry_wait');
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_discovery_digest_preferences(
  p_limit INTEGER,
  p_lock_token UUID
)
RETURNS SETOF public.user_discovery_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT p.user_id
    FROM public.user_discovery_preferences p
    WHERE p.email_enabled = TRUE
      AND p.next_digest_at <= NOW()
      AND (p.digest_locked_until IS NULL OR p.digest_locked_until < NOW())
    ORDER BY p.next_digest_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
  )
  UPDATE public.user_discovery_preferences p
  SET digest_lock_token = p_lock_token, digest_locked_until = NOW() + INTERVAL '10 minutes', updated_at = NOW()
  FROM due
  WHERE p.user_id = due.user_id
  RETURNING p.*;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_discovery_ingestion_hour(TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_discovery_ingestion_tasks(INTEGER, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_discovery_ingestion_task(UUID, UUID, BOOLEAN, JSONB, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retry_discovery_ingestion_task(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_discovery_digest_preferences(INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_discovery_ingestion_hour(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_discovery_ingestion_tasks(INTEGER, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_discovery_ingestion_task(UUID, UUID, BOOLEAN, JSONB, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_discovery_ingestion_task(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_discovery_digest_preferences(INTEGER, UUID) TO service_role;

COMMENT ON TABLE public.discovery_ingestion_tasks IS
  'Durable source scans. One row per source and UTC hourly bucket; leases make serverless workers safe to retry.';

NOTIFY pgrst, 'reload schema';
