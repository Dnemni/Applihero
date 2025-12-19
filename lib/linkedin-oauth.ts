// LinkedIn OAuth configuration and utilities
export const linkedinOAuthConfig = {
  clientId: process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID || '',
  clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
  redirectUri: typeof window !== 'undefined' 
    ? `${window.location.origin}/auth/linkedin-callback`
    : process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/linkedin-callback` : '',
};

// Generate LinkedIn OAuth URL for sign-in
export function getLinkedInOAuthURL(state: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: linkedinOAuthConfig.clientId,
    redirect_uri: linkedinOAuthConfig.redirectUri,
    state,
    scope: 'openid profile email',
  });

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

// Generate random state for CSRF protection
export function generateLinkedInState() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const state = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => chars[b % chars.length])
    .join('');

  return state;
}

// Store state in sessionStorage (client-side only)
export function storeLinkedInOAuthState(state: string) {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('linkedin_oauth_state', state);
  }
}

// Retrieve stored state
export function getStoredLinkedInOAuthState() {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('linkedin_oauth_state');
  }
  return null;
}

// Clear stored OAuth state
export function clearLinkedInOAuthState() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('linkedin_oauth_state');
  }
}
