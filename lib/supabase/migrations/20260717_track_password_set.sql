-- Track whether a user has manually enabled password login.
-- Run this in the Supabase SQL Editor for existing environments.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ;

UPDATE public.profiles p
SET password_set_at = COALESCE(p.password_set_at, u.updated_at, u.created_at)
FROM auth.users u
WHERE p.id = u.id
  AND u.encrypted_password IS NOT NULL
  AND u.encrypted_password <> '';

CREATE OR REPLACE FUNCTION public.user_has_password(p_user_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = p_user_id
      AND u.encrypted_password IS NOT NULL
      AND u.encrypted_password <> ''
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_password(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_password(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_profile_password_set_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.encrypted_password IS NOT NULL AND NEW.encrypted_password <> '' THEN
    UPDATE public.profiles
    SET password_set_at = COALESCE(password_set_at, NOW()),
        updated_at = NOW()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_password_set_at ON auth.users;
CREATE TRIGGER sync_profile_password_set_at
AFTER INSERT OR UPDATE OF encrypted_password ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_password_set_at();

COMMENT ON COLUMN public.profiles.password_set_at IS 'Timestamp when the user first manually enabled password login.';
COMMENT ON FUNCTION public.user_has_password(UUID) IS 'Returns true if auth.users has a stored password hash for the user.';
