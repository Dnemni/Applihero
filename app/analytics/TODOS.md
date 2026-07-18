# Analytics & Onboarding TODOs

## Analytics Page

- [ ] Review the analytics tour copy in `app/analytics/page.tsx` and decide whether it should feel like a standalone page tour or part of the main app onboarding.
- [ ] Decide whether analytics onboarding completion should stay in `localStorage` or move into the Supabase-backed onboarding state.
- [ ] If analytics becomes part of the main onboarding flow, add `"analytics"` to `OnboardingPhase` in `lib/onboarding-state.ts`.
- [ ] If analytics stays independent, consider adding a reset/replay entry point later so users can revisit the tour.
- [ ] Manually verify each analytics tour target lands cleanly: overview cards, charts, insights, and completion rates.

## Main Onboarding Flow

- [ ] Confirm the intended onboarding sequence across pages: profile → dashboard → job creation → job detail → resume optimizer → completed.
- [ ] Decide whether analytics belongs before or after dashboard, or remains optional after dashboard.
- [ ] Review dashboard onboarding copy now that it mentions analytics.
- [ ] Verify profile onboarding target IDs work for bio, save button, skills, experience, and education.
- [ ] Check that saving profile advances onboarding exactly once and does not repeat after refresh.

## Overlay Behavior

- [ ] Test tooltip placement for elements near the top, middle, and bottom of the page.
- [ ] Confirm smooth scrolling completes before the tooltip locks position.
- [ ] Check mobile/narrow viewport behavior for center-positioned and target-positioned steps.
- [ ] Decide whether skipped tours should mark only the current phase complete or finish the whole onboarding flow.

## Supabase & Auth Follow-Ups

- [ ] Confirm restored profile rows include the onboarding columns used by `lib/onboarding-state.ts`.
- [ ] Verify new Supabase publishable key is used only in `NEXT_PUBLIC_*` variables.
- [ ] Verify any service-role or secret keys are only in server-only env vars and have been rotated if exposed.
- [ ] Review the `@supabase/supabase-js` package bump and make sure the project runtime supports its Node engine requirement.
