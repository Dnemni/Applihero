ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS discovery_rematched_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.discovery_rematched_at IS
  'Last time the discovery finalizer visited this profile; used for fair bounded rotation.';

NOTIFY pgrst, 'reload schema';
