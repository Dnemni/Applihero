'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { getStoredOAuthState, clearOAuthState } from '@/lib/google-oauth';
import { ProfileService } from '@/lib/supabase/services';
import { initializeOnboarding } from '@/lib/onboarding-state';

export default function GoogleCallbackPage() {
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
          throw new Error('No authorization code received from Google');
        }

        // Verify state parameter (CSRF protection)
        const storedState = getStoredOAuthState();
        if (returnedState !== storedState) {
          throw new Error('State mismatch - possible CSRF attack');
        }

        // Exchange authorization code for tokens (server-side)
        const tokenResponse = await fetch('/api/auth/google-token', {
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
            errorData.googleError 
              ? `Google OAuth error: ${errorData.googleError}`
              : errorData.error || 'Failed to exchange authorization code for tokens'
          );
        }

        const { idToken, accessToken } = await tokenResponse.json();

        if (!idToken) {
          throw new Error('No ID token received');
        }

        // Sign in to Supabase using the ID token from Google
        const { data: authData, error: supabaseError } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });

        if (supabaseError) {
          console.error('Supabase sign in error:', supabaseError);
          throw supabaseError;
        }

        if (!authData.user) {
          throw new Error('Failed to create user session');
        }

        // Wait a moment for the database trigger to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Clear OAuth state from storage
        clearOAuthState();

        // Check if this is a new OAuth-only user
        try {
          const response = await fetch('/api/auth/check-identities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: authData.user.id }),
          });

          if (response.ok) {
            const identitiesData = await response.json();
            const hasEmailAuth = identitiesData.identities?.some(
              (id: any) => id.provider === 'email'
            );

            // If this is an OAuth-only user (no email/password auth), redirect to set password
            if (!hasEmailAuth) {
              // Extract name from Google metadata
              const name = authData.user.user_metadata?.full_name || authData.user.email?.split('@')[0] || 'User';
              const [firstName, ...lastNameParts] = name.split(' ');
              const lastName = lastNameParts.join(' ');

              // Update profile with name
              try {
                await fetch('/api/profile/update-names', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    userId: authData.user.id,
                    firstName,
                    lastName,
                  }),
                });
              } catch (err) {
                console.error('Error updating profile names:', err);
              }

              router.push('/auth/set-password?redirect=/profile');
              return;
            }
          }
        } catch (err) {
          console.error('Error checking identities:', err);
        }

        // For existing or non-OAuth users, proceed normally
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
