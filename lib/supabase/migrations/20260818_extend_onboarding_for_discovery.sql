-- Add the Discover walkthrough to the existing cross-page onboarding flow.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_onboarding_phase_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_onboarding_phase_check
  CHECK (onboarding_phase IN (
    'profile',
    'dashboard',
    'discover',
    'discover-detail',
    'job-creation',
    'job-detail',
    'resume-optimizer',
    'completed'
  ));

COMMENT ON COLUMN public.profiles.onboarding_phase IS
  'Current phase of the cross-page onboarding tutorial, including Discover and job-match review.';
