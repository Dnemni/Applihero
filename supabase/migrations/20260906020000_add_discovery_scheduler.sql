-- Supabase owns the durable discovery clock. pg_net calls the existing
-- cron-protected applihero.com routes asynchronously; Vault keeps credentials
-- out of migrations and cron.job command text.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE TABLE IF NOT EXISTS public.discovery_scheduler_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id BIGINT,
  configuration_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_scheduler_invocations_route
  ON public.discovery_scheduler_invocations(route, requested_at DESC);

ALTER TABLE public.discovery_scheduler_invocations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.invoke_discovery_service(
  p_route TEXT,
  p_timeout_milliseconds INTEGER DEFAULT 30000
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net, vault
AS $$
DECLARE
  base_url TEXT;
  cron_secret TEXT;
  net_request_id BIGINT;
  invocation_id UUID;
BEGIN
  IF p_route !~ '^/api/cron/discover/(dispatch|worker|enrichment|finalize)(\?|$)' THEN
    RAISE EXCEPTION 'Unsupported discovery service route';
  END IF;

  INSERT INTO public.discovery_scheduler_invocations(route)
  VALUES (p_route)
  RETURNING id INTO invocation_id;

  SELECT decrypted_secret INTO base_url
  FROM vault.decrypted_secrets
  WHERE name = 'discovery_cron_base_url'
  ORDER BY updated_at DESC
  LIMIT 1;

  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'discovery_cron_secret'
  ORDER BY updated_at DESC
  LIMIT 1;

  IF NULLIF(base_url, '') IS NULL OR NULLIF(cron_secret, '') IS NULL THEN
    UPDATE public.discovery_scheduler_invocations
    SET configuration_error = 'Missing discovery_cron_base_url or discovery_cron_secret in Vault'
    WHERE id = invocation_id;
    RETURN NULL;
  END IF;
  IF base_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' THEN
    UPDATE public.discovery_scheduler_invocations
    SET configuration_error = 'discovery_cron_base_url must be an HTTPS origin without a path'
    WHERE id = invocation_id;
    RETURN NULL;
  END IF;

  SELECT net.http_get(
    url := rtrim(base_url, '/') || p_route,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'User-Agent', 'AppliHero Supabase Scheduler/1.0'
    ),
    timeout_milliseconds := GREATEST(1000, LEAST(COALESCE(p_timeout_milliseconds, 30000), 120000))
  ) INTO net_request_id;

  UPDATE public.discovery_scheduler_invocations
  SET request_id = net_request_id
  WHERE id = invocation_id;

  DELETE FROM public.discovery_scheduler_invocations
  WHERE requested_at < NOW() - INTERVAL '7 days';
  RETURN net_request_id;
END;
$$;

-- Avoid duplicate jobs when this additive migration is replayed.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
  'applihero-discovery-dispatch',
  'applihero-discovery-source-a',
  'applihero-discovery-source-b',
  'applihero-discovery-enrichment-even',
  'applihero-discovery-enrichment-odd',
  'applihero-discovery-maintenance'
);

SELECT cron.schedule(
  'applihero-discovery-dispatch',
  '*/5 * * * *',
  $$SELECT public.invoke_discovery_service('/api/cron/discover/dispatch', 30000);$$
);

SELECT cron.schedule(
  'applihero-discovery-source-a',
  '1-59/3 * * * *',
  $$SELECT public.invoke_discovery_service('/api/cron/discover/worker?limit=1&drain=1&maxTasks=18&budgetMs=100000&lane=db-a', 115000);$$
);

SELECT cron.schedule(
  'applihero-discovery-source-b',
  '2-59/3 * * * *',
  $$SELECT public.invoke_discovery_service('/api/cron/discover/worker?limit=1&drain=1&maxTasks=18&budgetMs=100000&lane=db-b', 115000);$$
);

SELECT cron.schedule(
  'applihero-discovery-enrichment-even',
  '*/2 * * * *',
  $$SELECT public.invoke_discovery_service('/api/cron/discover/enrichment?batchSize=4&maxItems=40&budgetMs=45000&lane=db-even', 55000);$$
);

SELECT cron.schedule(
  'applihero-discovery-enrichment-odd',
  '1-59/2 * * * *',
  $$SELECT public.invoke_discovery_service('/api/cron/discover/enrichment?batchSize=4&maxItems=40&budgetMs=45000&lane=db-odd', 55000);$$
);

SELECT cron.schedule(
  'applihero-discovery-maintenance',
  '*/5 * * * *',
  $$SELECT public.invoke_discovery_service('/api/cron/discover/finalize?digestLimit=25&rematchBudgetMs=45000&rematchUserLimit=20&rematchPerUserLimit=250', 60000);$$
);

CREATE OR REPLACE FUNCTION public.get_discovery_scheduler_health()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, net, vault, cron
AS $$
  SELECT jsonb_build_object(
    'configured',
      EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'discovery_cron_base_url')
      AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'discovery_cron_secret'),
    'jobs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', job.jobname,
        'schedule', job.schedule,
        'active', job.active
      ) ORDER BY job.jobname)
      FROM cron.job job
      WHERE job.jobname LIKE 'applihero-discovery-%'
    ), '[]'::jsonb),
    'recentInvocations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'route', invocation.route,
        'requestedAt', invocation.requested_at,
        'requestId', invocation.request_id,
        'configurationError', invocation.configuration_error,
        'statusCode', response.status_code,
        'timedOut', response.timed_out,
        'requestError', response.error_msg
      ) ORDER BY invocation.requested_at DESC)
      FROM (
        SELECT * FROM public.discovery_scheduler_invocations
        ORDER BY requested_at DESC
        LIMIT 30
      ) invocation
      LEFT JOIN net._http_response response ON response.id = invocation.request_id
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON TABLE public.discovery_scheduler_invocations FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_discovery_service(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_discovery_scheduler_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_discovery_service(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_discovery_scheduler_health() TO service_role;

COMMENT ON FUNCTION public.invoke_discovery_service(TEXT, INTEGER) IS
  'Queues a Vault-authenticated call to an allowlisted AppliHero discovery service route.';

NOTIFY pgrst, 'reload schema';
