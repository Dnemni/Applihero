"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { ProfileService } from "@/lib/supabase/services";
import { initializeOnboarding } from "@/lib/onboarding-state";

export default function AuthCallbackPage() {
    const router = useRouter();

    useEffect(() => {
        async function handleCallback() {
            try {
                // Listen for auth state changes (handles OAuth callbacks)
                const { data: { subscription } } = supabase.auth.onAuthStateChange(
                    async (event: any, session: any) => {
                        if (event === 'SIGNED_IN' && session?.user) {
                            try {
                                // Wait a moment for the profile trigger to complete
                                await new Promise(resolve => setTimeout(resolve, 100));
                                
                                // Check if user signed up with OAuth and doesn't have a password yet
                                const { data: identities, error: identitiesError } = await supabase
                                    .rpc('get_user_identities', { p_user_id: session.user.id });
                                
                                const hasOAuthOnly = !identitiesError && identities && 
                                                   identities.some((i: any) => i.provider === 'google') && 
                                                   !identities.some((i: any) => i.provider === 'email');
                                
                                // Get profile
                                const profile = await ProfileService.getCurrentProfile();
                                
                                // For new OAuth users without password, redirect to set password first
                                if (hasOAuthOnly && profile && !profile.onboarding_completed) {
                                    // Extract name from OAuth metadata and update profile
                                    const fullName = session.user.user_metadata?.full_name || 
                                                   session.user.user_metadata?.name || '';
                                    const [firstName = '', lastName = ''] = fullName.split(' ');
                                    
                                    if (firstName || lastName) {
                                        await fetch('/api/profile/update-names', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                userId: session.user.id,
                                                firstName: firstName,
                                                lastName: lastName,
                                            }),
                                        });
                                    }
                                    
                                    // Redirect to set password
                                    router.push('/auth/set-password?redirect=/profile');
                                    return;
                                }
                                
                                // If no profile exists or onboarding not completed, go to profile
                                if (!profile || !profile.onboarding_completed) {
                                    initializeOnboarding();
                                    router.push("/profile");
                                    return;
                                }
                                
                                // Otherwise go to dashboard
                                router.push("/dashboard");
                            } catch (profileError) {
                                console.error('Error in OAuth callback:', profileError);
                                router.push("/dashboard");
                            }
                        } else if (event === 'SIGNED_OUT') {
                            router.push("/login");
                        }
                    }
                );

                // Also check current session as fallback
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    router.push(`/login?error=${encodeURIComponent(error.message)}`);
                    return;
                }

                if (session?.user) {
                    // Check profile and redirect appropriately
                    try {
                        // Wait a moment for profile trigger
                        await new Promise(resolve => setTimeout(resolve, 100));
                        
                        // Check if OAuth-only user
                        const { data: identities } = await supabase
                            .rpc('get_user_identities', { p_user_id: session.user.id });
                        
                        const hasOAuthOnly = identities && 
                                           identities.some((i: any) => i.provider === 'google') && 
                                           !identities.some((i: any) => i.provider === 'email');
                        
                        const profile = await ProfileService.getCurrentProfile();
                        
                        // Redirect OAuth-only new users to set password
                        if (hasOAuthOnly && profile && !profile.onboarding_completed) {
                            // Extract and save name
                            const fullName = session.user.user_metadata?.full_name || 
                                           session.user.user_metadata?.name || '';
                            const [firstName = '', lastName = ''] = fullName.split(' ');
                            
                            if (firstName || lastName) {
                                await fetch('/api/profile/update-names', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        userId: session.user.id,
                                        firstName,
                                        lastName,
                                    }),
                                });
                            }
                            
                            router.push('/auth/set-password?redirect=/profile');
                            return;
                        }
                        
                        if (!profile || !profile.onboarding_completed) {
                            initializeOnboarding();
                            router.push("/profile");
                        } else {
                            router.push("/dashboard");
                        }
                    } catch (profileError) {
                        console.error('Error in fallback check:', profileError);
                        // If profile check fails, still go to dashboard
                        router.push("/dashboard");
                    }
                } else {
                    // Wait a bit and check again (OAuth might still be processing)
                    setTimeout(() => {
                        supabase.auth.getSession().then(({ data: { session } }: any) => {
                            if (session?.user) {
                                router.push("/dashboard");
                            } else {
                                router.push("/login");
                            }
                        });
                    }, 100);
                }

                // Cleanup subscription on unmount
                return () => {
                    subscription.unsubscribe();
                };
            } catch (err) {
                router.push("/login?error=Authentication failed");
            }
        }

        handleCallback();
    }, [router]);

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
    );
}

