-- Give detail enrichment a finite, observable lifecycle. `failed` was the
-- original retryable state; keep it in the constraint during rolling deploys,
-- but migrate existing rows to retry_wait or dead.

ALTER TABLE public.discovery_enrichment_queue
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 8
    CHECK (max_attempts BETWEEN 1 AND 20),
  ADD COLUMN IF NOT EXISTS failure_kind TEXT
    CHECK (failure_kind IS NULL OR failure_kind IN ('transient', 'permanent', 'unavailable', 'exhausted')),
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

ALTER TABLE public.discovery_enrichment_queue
  DROP CONSTRAINT IF EXISTS discovery_enrichment_queue_status_check;

ALTER TABLE public.discovery_enrichment_queue
  ADD CONSTRAINT discovery_enrichment_queue_status_check
  CHECK (status IN ('pending', 'processing', 'complete', 'failed', 'retry_wait', 'dead'));

-- Rows whose canonical job is already complete or closed no longer need
-- provider traffic. Preserve them as completed audit records.
UPDATE public.discovery_enrichment_queue queue
SET status = 'complete',
    locked_at = NULL,
    lock_token = NULL,
    last_error = NULL,
    failure_kind = NULL,
    finished_at = COALESCE(queue.finished_at, NOW()),
    updated_at = NOW()
FROM public.discovery_jobs job
WHERE job.id = queue.discovery_job_id
  AND queue.status <> 'complete'
  AND (job.enrichment_status = 'complete' OR job.status = 'closed');

-- Convert the overloaded legacy failed state. Known non-retryable HTTP
-- responses become dead immediately; exhausted rows also stop cycling.
UPDATE public.discovery_enrichment_queue
SET status = CASE
      WHEN attempts >= max_attempts THEN 'dead'
      WHEN last_error ~* '(returned|status) (400|401|403|404|405|410|422)([^0-9]|$)' THEN 'dead'
      ELSE 'retry_wait'
    END,
    failure_kind = CASE
      WHEN attempts >= max_attempts THEN 'exhausted'
      WHEN last_error ~* '(returned|status) (400|401|403|404|405|410|422)([^0-9]|$)' THEN 'permanent'
      ELSE 'transient'
    END,
    finished_at = CASE
      WHEN attempts >= max_attempts OR last_error ~* '(returned|status) (400|401|403|404|405|410|422)([^0-9]|$)'
        THEN COALESCE(finished_at, NOW())
      ELSE NULL
    END,
    locked_at = NULL,
    lock_token = NULL,
    updated_at = NOW()
WHERE status = 'failed';

DROP INDEX IF EXISTS public.idx_discovery_enrichment_due;
CREATE INDEX idx_discovery_enrichment_due
  ON public.discovery_enrichment_queue(priority, next_attempt_at, created_at)
  WHERE status IN ('pending', 'retry_wait', 'failed');

CREATE INDEX IF NOT EXISTS idx_discovery_enrichment_expired_processing
  ON public.discovery_enrichment_queue(locked_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_discovery_enrichment_lifecycle
  ON public.discovery_enrichment_queue(status, updated_at DESC);

-- Missing details from followed companies affect Matches and alerts. Move
-- them ahead of general-catalog hydration without dropping catalog work.
UPDATE public.discovery_enrichment_queue queue
SET priority = LEAST(queue.priority, 5), updated_at = NOW()
WHERE queue.status IN ('pending', 'retry_wait', 'failed')
  AND EXISTS (
    SELECT 1 FROM public.user_job_source_subscriptions subscription
    WHERE subscription.source_id = queue.source_id AND subscription.enabled = TRUE
  );

CREATE OR REPLACE FUNCTION public.reconcile_discovery_enrichment_queue()
RETURNS TABLE(completed_count INTEGER, dead_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH completed AS (
    UPDATE public.discovery_enrichment_queue queue
    SET status = 'complete', locked_at = NULL, lock_token = NULL,
        last_error = NULL, failure_kind = NULL,
        finished_at = COALESCE(queue.finished_at, NOW()), updated_at = NOW()
    FROM public.discovery_jobs job
    WHERE job.id = queue.discovery_job_id
      AND queue.status IN ('pending', 'retry_wait', 'failed', 'processing')
      AND (job.enrichment_status = 'complete' OR job.status = 'closed')
    RETURNING queue.id
  ), exhausted AS (
    UPDATE public.discovery_enrichment_queue queue
    SET status = 'dead', failure_kind = COALESCE(queue.failure_kind, 'exhausted'),
        finished_at = COALESCE(queue.finished_at, NOW()),
        locked_at = NULL, lock_token = NULL, updated_at = NOW()
    WHERE queue.status IN ('pending', 'retry_wait', 'failed')
      AND queue.attempts >= queue.max_attempts
    RETURNING queue.id
  )
  SELECT (SELECT count(*)::INTEGER FROM completed),
         (SELECT count(*)::INTEGER FROM exhausted)
  INTO completed_count, dead_count;
  RETURN NEXT;
END;
$$;

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
    SELECT queue.id
    FROM public.discovery_enrichment_queue queue
    WHERE (
        queue.status IN ('pending', 'retry_wait', 'failed')
        OR (queue.status = 'processing' AND queue.locked_at < NOW() - INTERVAL '10 minutes')
      )
      AND queue.attempts < queue.max_attempts
      AND queue.next_attempt_at <= NOW()
    ORDER BY queue.priority ASC, queue.next_attempt_at ASC, queue.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 100))
  )
  UPDATE public.discovery_enrichment_queue queue
  SET status = 'processing', locked_at = NOW(), lock_token = p_lock_token,
      finished_at = NULL, updated_at = NOW()
  FROM due
  WHERE queue.id = due.id
  RETURNING queue.*;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_discovery_enrichment_queue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_discovery_enrichment(INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_discovery_enrichment_queue() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_discovery_enrichment(INTEGER, UUID) TO service_role;

COMMENT ON FUNCTION public.reconcile_discovery_enrichment_queue() IS
  'Completes obsolete enrichment work and terminalizes rows that exhausted their retry budget.';

NOTIFY pgrst, 'reload schema';
