'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { getStoredLinkedInOAuthState, clearLinkedInOAuthState } from '@/lib/linkedin-oauth';
import { ProfileService } from '@/lib/supabase/services';
import { initializeOnboarding } from '@/lib/onboarding-state';

export default function LinkedInCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const returnedState = searchParams.get('state');

        if (!code) {
          throw new Error('No authorization code received from LinkedIn');
        }

        // Verify state parameter (CSRF protection)
        const storedState = getStoredLinkedInOAuthState();
        if (returnedState !== storedState) {
          throw new Error('State mismatch - possible CSRF attack');
        }

        // Exchange authorization code for tokens and user info (server-side)
        const tokenResponse = await fetch('/api/auth/linkedin-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            state: returnedState,
          }),
        });

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json().catch(() => ({}));
          console.error('Token exchange failed:', {
            status: tokenResponse.status,
            statusText: tokenResponse.statusText,
            errorData,
            codeSnippet: code?.substring(0, 20) + '...',
          });
          throw new Error(
            errorData.linkedinError 
              ? `LinkedIn OAuth error: ${errorData.linkedinError}`
              : errorData.error || 'Failed to exchange authorization code for tokens'
          );
        }

        const { accessToken, userInfo } = await tokenResponse.json();

        if (!userInfo || !userInfo.email) {
          throw new Error('No user information received from LinkedIn');
        }

        // Sign in or sign up with email/password using LinkedIn email
        // First, try to sign in
        let authData;
        let isNewUser = false;

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: userInfo.email,
          password: `linkedin_temp_${userInfo.sub}`, // Temporary password
        });

        if (signInError) {
          // User doesn't exist, create account
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: userInfo.email,
            password: `linkedin_temp_${userInfo.sub}`,
            options: {
              data: {
                first_name: userInfo.given_name || '',
                last_name: userInfo.family_name || '',
                full_name: userInfo.name || '',
                linkedin_id: userInfo.sub,
                avatar_url: userInfo.picture || '',
                provider: 'linkedin',
              },
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          });

          if (signUpError) throw signUpError;
          authData = signUpData;
          isNewUser = true;
        } else {
          authData = signInData;
        }

        if (!authData.user) {
          throw new Error('Failed to create user session');
        }

        // No artificial wait; proceed immediately

        // Clear OAuth state from storage
        clearLinkedInOAuthState();

        // Update profile with LinkedIn info
        if (isNewUser || userInfo.picture) {
          try {
            await fetch('/api/profile/update-names', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: authData.user.id,
                firstName: userInfo.given_name || '',
                lastName: userInfo.family_name || '',
                email: userInfo.email,
              }),
            });
          } catch (err) {
            console.error('Error updating profile names:', err);
          }
        }

        // For new users, redirect to set-password
        if (isNewUser) {
          router.push('/auth/set-password?redirect=/profile&provider=linkedin');
          return;
        }

        // For existing users, check onboarding status
        const profile = await ProfileService.getCurrentProfile();
        if (profile && !profile.onboarding_completed) {
          initializeOnboarding();
          router.push('/profile');
        } else {
          router.push('/dashboard');
        }
      } catch (err: any) {
        console.error('OAuth callback error:', err);
        setError(err.message || 'Authentication failed');
        setLoading(false);
      }
    };

    if (searchParams) {
      handleCallback();
    }
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Authentication Failed</h1>
          <p className="text-gray-700 mb-6">{error}</p>
          <a
            href="/login"
            className="inline-block bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 transition"
          >
            Back to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
      <div className="text-center">
        <div className="inline-block">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
        </div>
        <p className="mt-4 text-gray-700 font-medium">Completing your authentication...</p>
      </div>
    </div>
  );
}
