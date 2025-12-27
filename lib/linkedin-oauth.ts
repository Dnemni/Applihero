import { getLinkedInRedirectUri } from "@/lib/oauth/redirect";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  storeLinkedInCodeVerifier,
} from "@/lib/linkedin-pkce";

// LinkedIn OAuth configuration and utilities
export const linkedinOAuthConfig = {
  clientId: process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID || '',
  clientSecret: process.env.LINKEDIN_SECRET || '',
};

// Build the LinkedIn OAuth 2.0 authorization URL (3-legged OAuth with PKCE)
export async function getLinkedInOAuthURL(state: string) {
  const redirectUri = getLinkedInRedirectUri();

  // LinkedIn verification product does NOT require PKCE
  const params = new URLSearchParams({
    response_type: "code",
    client_id: linkedinOAuthConfig.clientId,
    redirect_uri: redirectUri,
    state,
    scope: "r_verify r_profile_basicinfo",
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
