-- Charge an attempt at claim time: a killed serverless worker never reaches
-- its completion handler. Retain the charged value for rolling-deploy clients.
ALTER TABLE public.discovery_enrichment_queue ADD COLUMN IF NOT EXISTS claimed_attempt integer;

CREATE OR REPLACE FUNCTION public.claim_discovery_enrichment(p_limit integer, p_lock_token uuid)
RETURNS SETOF public.discovery_enrichment_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.discovery_enrichment_queue
  SET status='dead', failure_kind='exhausted', finished_at=now(), updated_at=now(), lock_token=null, locked_at=null
  WHERE attempts >= max_attempts AND (
    status IN ('pending','retry_wait','failed') OR
    (status='processing' AND locked_at < now() - interval '10 minutes')
  );
  RETURN QUERY
  WITH due AS (
    SELECT q.id FROM public.discovery_enrichment_queue q
    WHERE (q.status IN ('pending','retry_wait','failed') OR
      (q.status='processing' AND q.locked_at < now() - interval '10 minutes'))
      AND q.attempts < q.max_attempts AND q.next_attempt_at <= now()
    ORDER BY q.priority, q.next_attempt_at, q.created_at
    FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(coalesce(p_limit,4),100))
  )
  UPDATE public.discovery_enrichment_queue q
  SET status='processing', attempts=q.attempts+1, claimed_attempt=q.attempts+1,
      locked_at=now(),lock_token=p_lock_token,finished_at=null,updated_at=now()
  FROM due WHERE q.id=due.id RETURNING q.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_discovery_enrichment(integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_discovery_enrichment(integer,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
