-- Keep existing drafts, including historical duplicates. Serializing creation
-- per user/posting makes concurrent starts converge without rewriting user work.
CREATE OR REPLACE FUNCTION public.start_discovery_workspace(p_user_id uuid, p_discovery_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE existing_id uuid; posting public.discovery_jobs%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_discovery_job_id::text, 0));
  SELECT id INTO existing_id FROM public.jobs
    WHERE user_id = p_user_id AND discovery_job_id = p_discovery_job_id
    ORDER BY created_at ASC, id ASC LIMIT 1;
  IF existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('jobId', existing_id, 'existing', true);
  END IF;
  SELECT * INTO posting FROM public.discovery_jobs WHERE id = p_discovery_job_id;
  IF NOT FOUND OR posting.status = 'closed' THEN
    RETURN jsonb_build_object('unavailable', true);
  END IF;
  INSERT INTO public.jobs(user_id, discovery_job_id, job_title, company_name, job_description, status)
    VALUES (p_user_id, posting.id, posting.title, posting.company_name, posting.description, 'Draft')
    RETURNING id INTO existing_id;
  RETURN jsonb_build_object('jobId', existing_id, 'existing', false);
END;
$$;
REVOKE ALL ON FUNCTION public.start_discovery_workspace(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_discovery_workspace(uuid, uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
