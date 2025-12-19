// Google OAuth configuration and utilities
export const googleOAuthConfig = {
  clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: typeof window !== 'undefined' 
    ? `${window.location.origin}/auth/google-callback`
    : process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/google-callback` : '',
};

// Generate Google OAuth URL for sign-in
export function getGoogleOAuthURL(state: string) {
  const params = new URLSearchParams({
    client_id: googleOAuthConfig.clientId,
    redirect_uri: googleOAuthConfig.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Generate random state for CSRF protection
export function generateState() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const state = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => chars[b % chars.length])
    .join('');

  return state;
}

// Store state in sessionStorage (client-side only)
export function storeOAuthState(state: string) {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('oauth_state', state);
  }
}

// Retrieve stored state
export function getStoredOAuthState() {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('oauth_state');
  }
  return null;
}

// Clear stored OAuth state
export function clearOAuthState() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('oauth_state');
  }
}