-- Temporary fix: Make email nullable to allow profile creation during OAuth
-- The email will be filled in by the update-names API call

-- Make email nullable (remove NOT NULL constraint)
ALTER TABLE public.profiles 
ALTER COLUMN email DROP NOT NULL;

-- Update any existing profiles with null emails to use the auth.users email
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- Note: After running this, you can re-add the NOT NULL constraint if desired:
-- ALTER TABLE public.profiles ALTER COLUMN email SET NOT NULL;
