-- Create RPC function to get user identities
-- This allows checking if a user has OAuth-only login or also has email/password

CREATE OR REPLACE FUNCTION public.get_user_identities(p_user_id UUID)
RETURNS TABLE (
  id TEXT,
  user_id UUID,
  provider TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if the requesting user matches the user_id parameter
  IF auth.uid() = p_user_id THEN
    RETURN QUERY
    SELECT 
      i.id::TEXT,
      i.user_id,
      i.provider,
      i.created_at,
      i.updated_at
    FROM auth.identities i
    WHERE i.user_id = p_user_id;
  ELSE
    RAISE EXCEPTION 'Unauthorized';
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_identities(UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.get_user_identities IS 'Returns identity providers for a given user (OAuth, email, etc). User can only query their own identities.';
