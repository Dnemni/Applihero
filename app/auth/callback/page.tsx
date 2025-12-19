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
                            // Check if profile exists and handle onboarding for new OAuth users
                            try {
                                const profile = await ProfileService.getCurrentProfile();
                                
                                // If no profile exists or onboarding not completed, initialize it
                                if (!profile || !profile.onboarding_completed) {
                                    // For OAuth users, extract name from user metadata
                                    const fullName = session.user.user_metadata?.full_name || 
                                                   session.user.user_metadata?.name || '';
                                    const [firstName = '', lastName = ''] = fullName.split(' ');
                                    
                                    // Update profile with OAuth metadata if available
                                    if (profile && (firstName || lastName)) {
                                        await fetch('/api/profile/update-names', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                userId: session.user.id,
                                                firstName: firstName || profile.first_name,
                                                lastName: lastName || profile.last_name,
                                            }),
                                        });
                                    }
                                    
                                    initializeOnboarding();
                                    router.push("/profile");
                                    return;
                                }
                            } catch (profileError) {
                                console.error('Error checking profile:', profileError);
                            }
                            
                            router.push("/dashboard");
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
                        const profile = await ProfileService.getCurrentProfile();
                        if (!profile || !profile.onboarding_completed) {
                            initializeOnboarding();
                            router.push("/profile");
                        } else {
                            router.push("/dashboard");
                        }
                    } catch (profileError) {
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
                    }, 1000);
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
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                <p className="text-lg font-medium text-gray-900 mb-2">Completing sign in...</p>
                <p className="text-sm text-gray-600">Please wait</p>
            </div>
        </div>
    );
}

