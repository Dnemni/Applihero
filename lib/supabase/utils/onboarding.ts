import { supabase } from '../client';
import { ProfileService } from '../services';

/**
 * Check if the current user has completed onboarding
 */
export async function checkOnboardingStatus(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const profile = await ProfileService.getCurrentProfile();
    return profile?.onboarding_completed ?? false;
}

/**
 * Redirect to onboarding if not completed
 */
export async function requireOnboarding(router: { push: (path: string) => void }): Promise<boolean> {
    const completed = await checkOnboardingStatus();
    if (!completed) {
        router.push('/onboarding');
        return false;
    }
    return true;
}

