-- Additive foundation only. The isolated offline demo does NOT write these tables.
-- Existing jobs are PRIVATE user application records; do not rename or copy them.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS jobs_id_user_id_preparation ON public.jobs(id, user_id);
CREATE TABLE public.preparation_captures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 job_id uuid NOT NULL,
 origin text NOT NULL,
 route text NOT NULL,
 schema_hash text NOT NULL,
 revision integer NOT NULL CHECK (revision > 0),
 inventory jsonb NOT NULL CHECK (jsonb_typeof(inventory) = 'array'),
 coverage text NOT NULL DEFAULT 'current_step_only' CHECK (coverage IN ('current_step_only','known_steps_only')),
 captured_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,user_id), UNIQUE(job_id,schema_hash), UNIQUE(job_id,revision),
 FOREIGN KEY(job_id,user_id) REFERENCES public.jobs(id,user_id) ON DELETE CASCADE
);
CREATE TABLE public.preparation_answer_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 job_id uuid NOT NULL,
 question_key text NOT NULL,
 context jsonb NOT NULL DEFAULT '{}',
 typed_content jsonb NOT NULL,
 version integer NOT NULL CHECK(version > 0),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved','superseded')),
 origin text NOT NULL CHECK(origin IN ('user','coach')),
 approved_at timestamptz,
 expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,user_id), UNIQUE(job_id,question_key,version),
 CHECK(state <> 'approved' OR approved_at IS NOT NULL),
 FOREIGN KEY(job_id,user_id) REFERENCES public.jobs(id,user_id) ON DELETE CASCADE
);
CREATE FUNCTION public.preparation_protect_approved_answer() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF OLD.state IN ('approved','superseded') AND (NEW.typed_content IS DISTINCT FROM OLD.typed_content OR NEW.question_key IS DISTINCT FROM OLD.question_key OR NEW.context IS DISTINCT FROM OLD.context OR NEW.version <> OLD.version OR NEW.job_id <> OLD.job_id OR NEW.user_id <> OLD.user_id OR NEW.state = 'draft') THEN
  RAISE EXCEPTION 'Create a new draft version; approved content is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preparation_immutable_answer BEFORE UPDATE ON public.preparation_answer_versions FOR EACH ROW EXECUTE FUNCTION public.preparation_protect_approved_answer();
CREATE TABLE public.preparation_bindings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 capture_id uuid NOT NULL,
 field_id text NOT NULL,
 answer_id uuid NOT NULL,
 option_mapping jsonb NOT NULL DEFAULT '{}',
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(capture_id,field_id),
 FOREIGN KEY(capture_id,user_id) REFERENCES public.preparation_captures(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(answer_id,user_id) REFERENCES public.preparation_answer_versions(id,user_id) ON DELETE CASCADE
);
CREATE TABLE public.preparation_fill_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 capture_id uuid NOT NULL,
 schema_hash text NOT NULL,
 origin text NOT NULL,
 revision integer NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,user_id),
 FOREIGN KEY(capture_id,user_id) REFERENCES public.preparation_captures(id,user_id) ON DELETE CASCADE
);
CREATE TABLE public.preparation_field_results (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 plan_id uuid NOT NULL,
 field_id text NOT NULL,
 result_code text NOT NULL CHECK(result_code IN ('filled_verified','skipped_user_value','approval_needed','stale_schema','ambiguous_locator','option_missing','validation_error','unsupported','manual_upload_required')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(plan_id,field_id),
 FOREIGN KEY(plan_id,user_id) REFERENCES public.preparation_fill_plans(id,user_id) ON DELETE CASCADE
);
-- Composite foreign keys prevent cross-tenant references independently of RLS.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['preparation_captures','preparation_answer_versions','preparation_bindings','preparation_fill_plans','preparation_field_results'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY owner_select ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)',t);
  EXECUTE format('CREATE POLICY owner_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)',t);
  EXECUTE format('CREATE POLICY owner_delete ON public.%I FOR DELETE TO authenticated USING (auth.uid() = user_id)',t);
  IF t = 'preparation_answer_versions' THEN
   EXECUTE format('CREATE POLICY owner_update ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',t);
  END IF;
  EXECUTE format('CREATE INDEX ON public.%I(user_id)',t);
 END LOOP;
END $$;
COMMIT;
