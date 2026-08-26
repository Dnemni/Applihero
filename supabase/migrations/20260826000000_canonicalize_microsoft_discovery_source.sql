-- Consolidate the legacy Microsoft schema.org source into the verified
-- Eightfold adapter. This preserves each user's notification settings while
-- preventing the generic source from being selected again.
DO $$
DECLARE
  canonical_id UUID;
  legacy_id UUID;
BEGIN
  SELECT id INTO canonical_id
  FROM public.job_sources
  WHERE provider = 'eightfold' AND external_key = 'microsoft.com'
  LIMIT 1;

  FOR legacy_id IN
    SELECT id FROM public.job_sources
    WHERE company_name ILIKE 'Microsoft'
      AND provider = 'career_site'
      AND id IS DISTINCT FROM canonical_id
  LOOP
    IF canonical_id IS NOT NULL THEN
      INSERT INTO public.user_job_source_subscriptions
        (user_id, source_id, enabled, notify_email, min_fit_score, subscribed_at)
      SELECT user_id, canonical_id, enabled, notify_email, min_fit_score, subscribed_at
      FROM public.user_job_source_subscriptions
      WHERE source_id = legacy_id
      ON CONFLICT (user_id, source_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        notify_email = EXCLUDED.notify_email,
        min_fit_score = EXCLUDED.min_fit_score;

      DELETE FROM public.user_job_source_subscriptions WHERE source_id = legacy_id;
      UPDATE public.user_job_recommendations SET active = FALSE WHERE source_id = legacy_id;
    END IF;
    UPDATE public.job_sources SET enabled = FALSE WHERE id = legacy_id;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
